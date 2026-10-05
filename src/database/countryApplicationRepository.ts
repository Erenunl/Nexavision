import type {
  CountryApplication,
  CountryApplicationCreateResult,
  CountryApprovalResult,
} from "../types/country.js";
import { getDatabase } from "./connection.js";

interface ApplicationRow {
  id: number;
  guild_id: string;
  discord_user_id: string;
  country_code: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  admin_channel_id: string | null;
  admin_message_id: string | null;
}

interface AssignmentRow {
  id: number;
  guild_id: string;
  country_code: string;
  discord_user_id: string;
  assigned_at: string;
  approved_by: string;
  active: number;
}

type ApprovalEligibility =
  | { ok: true; application: CountryApplication }
  | {
      ok: false;
      reason: "not_pending" | "already_assigned" | "country_taken";
      countryCode?: string;
    };

function applicationFromRow(row: ApplicationRow): CountryApplication {
  return {
    id: row.id,
    guildId: row.guild_id,
    discordUserId: row.discord_user_id,
    countryCode: row.country_code,
    status: row.status,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    rejectionReason: row.rejection_reason,
    adminChannelId: row.admin_channel_id,
    adminMessageId: row.admin_message_id,
  };
}

export class CountryApplicationRepository {
  findById(id: number): CountryApplication | null {
    const row = getDatabase().prepare("SELECT * FROM country_applications WHERE id = ?").get(id) as
      | ApplicationRow
      | undefined;
    return row ? applicationFromRow(row) : null;
  }

  createPending(guildId: string, discordUserId: string, countryCode: string): CountryApplicationCreateResult {
    const database = getDatabase();
    const operation = database.transaction((): CountryApplicationCreateResult => {
      const userAssignment = database
        .prepare(
          "SELECT country_code FROM country_assignments WHERE guild_id = ? AND discord_user_id = ? AND active = 1 LIMIT 1",
        )
        .get(guildId, discordUserId) as { country_code: string } | undefined;
      if (userAssignment) {
        return { ok: false, reason: "already_assigned", countryCode: userAssignment.country_code };
      }

      if (
        database
          .prepare(
            "SELECT 1 FROM country_assignments WHERE guild_id = ? AND country_code = ? AND active = 1 LIMIT 1",
          )
          .get(guildId, countryCode)
      ) {
        return { ok: false, reason: "country_taken" };
      }

      if (
        database
          .prepare(
            "SELECT 1 FROM country_applications WHERE guild_id = ? AND discord_user_id = ? AND status = 'PENDING' LIMIT 1",
          )
          .get(guildId, discordUserId)
      ) {
        return { ok: false, reason: "user_pending" };
      }

      if (
        database
          .prepare(
            "SELECT 1 FROM country_applications WHERE guild_id = ? AND country_code = ? AND status = 'PENDING' LIMIT 1",
          )
          .get(guildId, countryCode)
      ) {
        return { ok: false, reason: "country_pending" };
      }

      const result = database
        .prepare(
          `INSERT INTO country_applications
             (guild_id, discord_user_id, country_code, status, submitted_at)
           VALUES (?, ?, ?, 'PENDING', ?)`,
        )
        .run(guildId, discordUserId, countryCode, new Date().toISOString());
      return { ok: true, application: this.findById(Number(result.lastInsertRowid))! };
    });
    return operation.immediate();
  }

  attachAdminMessage(id: number, channelId: string, messageId: string): void {
    getDatabase()
      .prepare(
        "UPDATE country_applications SET admin_channel_id = ?, admin_message_id = ? WHERE id = ? AND status = 'PENDING'",
      )
      .run(channelId, messageId, id);
  }

  hasActiveAssignment(guildId: string, discordUserId: string, countryCode: string): boolean {
    return Boolean(
      getDatabase()
        .prepare(
          `SELECT 1 FROM country_assignments
           WHERE guild_id = ? AND discord_user_id = ? AND country_code = ? AND active = 1 LIMIT 1`,
        )
        .get(guildId, discordUserId, countryCode),
    );
  }

  checkApproval(id: number): ApprovalEligibility {
    const application = this.findById(id);
    if (!application || application.status !== "PENDING") return { ok: false, reason: "not_pending" };
    const database = getDatabase();
    const userAssignment = database
      .prepare(
        "SELECT country_code FROM country_assignments WHERE guild_id = ? AND discord_user_id = ? AND active = 1 LIMIT 1",
      )
      .get(application.guildId, application.discordUserId) as { country_code: string } | undefined;
    if (userAssignment) {
      return { ok: false, reason: "already_assigned", countryCode: userAssignment.country_code };
    }
    if (
      database
        .prepare(
          "SELECT 1 FROM country_assignments WHERE guild_id = ? AND country_code = ? AND active = 1 LIMIT 1",
        )
        .get(application.guildId, application.countryCode)
    ) {
      return { ok: false, reason: "country_taken", countryCode: application.countryCode };
    }
    return { ok: true, application };
  }

  approveAndAssign(id: number, reviewerId: string): CountryApprovalResult {
    const database = getDatabase();
    const operation = database.transaction((): CountryApprovalResult => {
      const eligibility = this.checkApproval(id);
      if (!eligibility.ok) return eligibility;
      const application = eligibility.application;
      const assignedAt = new Date().toISOString();
      const assignmentResult = database
        .prepare(
          `INSERT INTO country_assignments
             (guild_id, country_code, discord_user_id, assigned_at, approved_by, active)
           VALUES (?, ?, ?, ?, ?, 1)`,
        )
        .run(
          application.guildId,
          application.countryCode,
          application.discordUserId,
          assignedAt,
          reviewerId,
        );
      const reviewResult = database
        .prepare(
          `UPDATE country_applications
           SET status = 'APPROVED', reviewed_at = ?, reviewed_by = ?
           WHERE id = ? AND status = 'PENDING'`,
        )
        .run(assignedAt, reviewerId, id);
      if (reviewResult.changes !== 1) throw new Error("Country application status race detected.");

      return {
        ok: true,
        assignment: {
          id: Number(assignmentResult.lastInsertRowid),
          guildId: application.guildId,
          countryCode: application.countryCode,
          discordUserId: application.discordUserId,
          assignedAt,
          approvedBy: reviewerId,
          active: true,
        },
      };
    });
    return operation.immediate();
  }

  rejectIfPending(id: number, reviewerId: string, reason: string): boolean {
    const result = getDatabase()
      .prepare(
        `UPDATE country_applications
         SET status = 'REJECTED', reviewed_at = ?, reviewed_by = ?, rejection_reason = ?
         WHERE id = ? AND status = 'PENDING'`,
      )
      .run(new Date().toISOString(), reviewerId, reason, id);
    return result.changes === 1;
  }

  rejectSystemFailure(id: number, reason: string): void {
    getDatabase()
      .prepare(
        `UPDATE country_applications
         SET status = 'REJECTED', reviewed_at = ?, rejection_reason = ?
         WHERE id = ? AND status = 'PENDING'`,
      )
      .run(new Date().toISOString(), reason, id);
  }
}
