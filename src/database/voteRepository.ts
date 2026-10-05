import { EUROVISION_POINTS, type EurovisionPoint } from "../config/voting.js";
import type { VoteBallot, VoteEntry } from "../types/vote.js";
import { getDatabase } from "./connection.js";

interface BallotRow {
  id: number;
  guild_id: string;
  voter_user_id: string;
  voter_country_code: string;
  status: "DRAFT" | "SUBMITTED";
  draft_json: string | null;
  created_at: string;
  submitted_at: string | null;
  updated_at: string;
}

interface EntryRow {
  target_country_code: string;
  points: EurovisionPoint;
}

function parseDraft(raw: string | null): VoteEntry[] | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(
      (entry): entry is VoteEntry =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof (entry as VoteEntry).targetCountryCode === "string" &&
        EUROVISION_POINTS.includes((entry as VoteEntry).points),
    );
  } catch {
    return [];
  }
}

export class VoteRepository {
  findByUser(guildId: string, userId: string): VoteBallot | null {
    const database = getDatabase();
    const row = database
      .prepare("SELECT * FROM vote_ballots WHERE guild_id = ? AND voter_user_id = ? LIMIT 1")
      .get(guildId, userId) as BallotRow | undefined;
    if (!row) return null;
    const entries = database
      .prepare("SELECT target_country_code, points FROM vote_entries WHERE ballot_id = ? ORDER BY points DESC")
      .all(row.id) as EntryRow[];
    return {
      id: row.id,
      guildId: row.guild_id,
      voterUserId: row.voter_user_id,
      voterCountryCode: row.voter_country_code,
      status: row.status,
      draft: parseDraft(row.draft_json),
      entries: entries.map((entry) => ({
        targetCountryCode: entry.target_country_code,
        points: entry.points,
      })),
      createdAt: row.created_at,
      submittedAt: row.submitted_at,
      updatedAt: row.updated_at,
    };
  }

  beginDraft(guildId: string, userId: string, countryCode: string): VoteBallot {
    const database = getDatabase();
    const existing = this.findByUser(guildId, userId);
    const now = new Date().toISOString();
    if (!existing) {
      database
        .prepare(
          `INSERT INTO vote_ballots
           (guild_id, voter_user_id, voter_country_code, status, draft_json, created_at, updated_at)
           VALUES (?, ?, ?, 'DRAFT', '[]', ?, ?)`,
        )
        .run(guildId, userId, countryCode, now, now);
    } else if (existing.draft === null) {
      database
        .prepare("UPDATE vote_ballots SET voter_country_code = ?, draft_json = ?, updated_at = ? WHERE id = ?")
        .run(countryCode, JSON.stringify(existing.entries), now, existing.id);
    }
    return this.findByUser(guildId, userId)!;
  }

  setDraftChoice(
    guildId: string,
    userId: string,
    points: EurovisionPoint,
    targetCountryCode: string,
  ): "UPDATED" | "DUPLICATE" | "NOT_FOUND" {
    const ballot = this.findByUser(guildId, userId);
    if (!ballot || ballot.draft === null) return "NOT_FOUND";
    if (ballot.draft.some((entry) => entry.targetCountryCode === targetCountryCode && entry.points !== points)) {
      return "DUPLICATE";
    }
    const draft = ballot.draft.filter((entry) => entry.points !== points);
    draft.push({ points, targetCountryCode });
    getDatabase()
      .prepare("UPDATE vote_ballots SET draft_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(draft), new Date().toISOString(), ballot.id);
    return "UPDATED";
  }

  submitDraft(ballot: VoteBallot, entries: readonly VoteEntry[]): VoteBallot {
    const database = getDatabase();
    database.transaction(() => {
      database.prepare("DELETE FROM vote_entries WHERE ballot_id = ?").run(ballot.id);
      const insert = database.prepare(
        "INSERT INTO vote_entries (ballot_id, target_country_code, points) VALUES (?, ?, ?)",
      );
      for (const entry of entries) insert.run(ballot.id, entry.targetCountryCode, entry.points);
      const now = new Date().toISOString();
      database
        .prepare(
          `UPDATE vote_ballots SET status = 'SUBMITTED', draft_json = NULL,
           submitted_at = COALESCE(submitted_at, ?), updated_at = ? WHERE id = ?`,
        )
        .run(now, now, ballot.id);
    })();
    return this.findByUser(ballot.guildId, ballot.voterUserId)!;
  }

  cancelDraft(guildId: string, userId: string): void {
    const ballot = this.findByUser(guildId, userId);
    if (!ballot) return;
    if (ballot.status === "DRAFT" && ballot.entries.length === 0) {
      getDatabase().prepare("DELETE FROM vote_ballots WHERE id = ?").run(ballot.id);
    } else {
      getDatabase()
        .prepare("UPDATE vote_ballots SET draft_json = NULL, updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), ballot.id);
    }
  }

  restartDraft(guildId: string, userId: string, countryCode: string): VoteBallot | null {
    const ballot = this.findByUser(guildId, userId);
    if (!ballot) return null;
    getDatabase()
      .prepare(
        "UPDATE vote_ballots SET voter_country_code = ?, draft_json = '[]', updated_at = ? WHERE id = ?",
      )
      .run(countryCode, new Date().toISOString(), ballot.id);
    return this.findByUser(guildId, userId);
  }

  listSubmitted(guildId: string): VoteBallot[] {
    const rows = getDatabase()
      .prepare("SELECT voter_user_id FROM vote_ballots WHERE guild_id = ? AND status = 'SUBMITTED'")
      .all(guildId) as Array<{ voter_user_id: string }>;
    return rows.map((row) => this.findByUser(guildId, row.voter_user_id)!).filter(Boolean);
  }

  hasSubmitted(guildId: string, userId: string): boolean {
    return Boolean(
      getDatabase()
        .prepare(
          "SELECT 1 FROM vote_ballots WHERE guild_id = ? AND voter_user_id = ? AND status = 'SUBMITTED' LIMIT 1",
        )
        .get(guildId, userId),
    );
  }

  resetByUser(guildId: string, userId: string): boolean {
    return getDatabase()
      .prepare("DELETE FROM vote_ballots WHERE guild_id = ? AND voter_user_id = ?")
      .run(guildId, userId).changes === 1;
  }
}
