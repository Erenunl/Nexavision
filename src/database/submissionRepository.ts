import { getDatabase } from "./connection.js";
import type { AssignedParticipant, SongSubmission } from "../types/submission.js";
import type { YouTubeVideo } from "../types/youtube.js";

interface SubmissionRow {
  id: number;
  guild_id: string;
  discord_user_id: string;
  country_code: string;
  country_name: string;
  country_flag: string;
  youtube_video_id: string;
  youtube_url: string;
  song_title: string;
  youtube_channel_name: string;
  thumbnail_url: string | null;
  view_count_at_submission: number;
  view_count_at_approval: number | null;
  duration: string;
  published_at: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  admin_channel_id: string | null;
  admin_message_id: string | null;
  locked: number;
  replaces_submission_id: number | null;
}

function fromRow(row: SubmissionRow): SongSubmission {
  return {
    id: row.id,
    guildId: row.guild_id,
    discordUserId: row.discord_user_id,
    countryCode: row.country_code,
    countryName: row.country_name,
    countryFlag: row.country_flag,
    youtubeVideoId: row.youtube_video_id,
    youtubeUrl: row.youtube_url,
    songTitle: row.song_title,
    youtubeChannelName: row.youtube_channel_name,
    thumbnailUrl: row.thumbnail_url,
    viewCountAtSubmission: row.view_count_at_submission,
    viewCountAtApproval: row.view_count_at_approval,
    duration: row.duration,
    publishedAt: row.published_at,
    status: row.status,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    rejectionReason: row.rejection_reason,
    adminChannelId: row.admin_channel_id,
    adminMessageId: row.admin_message_id,
    locked: row.locked === 1,
    replacesSubmissionId: row.replaces_submission_id,
  };
}

export class SubmissionRepository {
  findById(id: number): SongSubmission | null {
    const row = getDatabase().prepare("SELECT * FROM song_submissions WHERE id = ?").get(id) as
      | SubmissionRow
      | undefined;
    return row ? fromRow(row) : null;
  }

  hasPendingForUser(guildId: string, discordUserId: string): boolean {
    return Boolean(
      getDatabase()
        .prepare(
          "SELECT 1 FROM song_submissions WHERE guild_id = ? AND discord_user_id = ? AND status = 'PENDING' LIMIT 1",
        )
        .get(guildId, discordUserId),
    );
  }

  hasApprovedVideo(guildId: string, videoId: string): boolean {
    return Boolean(
      getDatabase()
        .prepare(
          "SELECT 1 FROM song_submissions WHERE guild_id = ? AND youtube_video_id = ? AND status = 'APPROVED' LIMIT 1",
        )
        .get(guildId, videoId),
    );
  }

  hasApprovedCountry(guildId: string, countryCode: string): boolean {
    return Boolean(
      getDatabase()
        .prepare(
          "SELECT 1 FROM song_submissions WHERE guild_id = ? AND country_code = ? AND status = 'APPROVED' LIMIT 1",
        )
        .get(guildId, countryCode),
    );
  }

  findApprovedByCountry(guildId: string, countryCode: string): SongSubmission | null {
    const row = getDatabase()
      .prepare(
        "SELECT * FROM song_submissions WHERE guild_id = ? AND country_code = ? AND status = 'APPROVED' LIMIT 1",
      )
      .get(guildId, countryCode) as SubmissionRow | undefined;
    return row ? fromRow(row) : null;
  }

  listApproved(guildId: string): SongSubmission[] {
    const rows = getDatabase()
      .prepare("SELECT * FROM song_submissions WHERE guild_id = ? AND status = 'APPROVED' ORDER BY country_code")
      .all(guildId) as SubmissionRow[];
    return rows.map(fromRow);
  }

  countByStatus(guildId: string, status: SongSubmission["status"]): number {
    const row = getDatabase()
      .prepare("SELECT COUNT(*) AS count FROM song_submissions WHERE guild_id = ? AND status = ?")
      .get(guildId, status) as { count: number };
    return row.count;
  }

  createPending(guildId: string, participant: AssignedParticipant, video: YouTubeVideo): SongSubmission {
    const submittedAt = new Date().toISOString();
    const result = getDatabase()
      .prepare(
        `INSERT INTO song_submissions (
           guild_id, discord_user_id, country_code, country_name, country_flag,
           youtube_video_id, youtube_url, song_title, youtube_channel_name,
           thumbnail_url, view_count_at_submission, duration, published_at,
           status, submitted_at
         ) VALUES (
           @guildId, @discordUserId, @countryCode, @countryName, @countryFlag,
           @videoId, @canonicalUrl, @title, @channelTitle,
           @thumbnailUrl, @viewCount, @duration, @publishedAt,
           'PENDING', @submittedAt
         )`,
      )
      .run({
        guildId,
        discordUserId: participant.discordUserId,
        countryCode: participant.countryCode,
        countryName: participant.countryName,
        countryFlag: participant.countryFlag,
        videoId: video.videoId,
        canonicalUrl: video.canonicalUrl,
        title: video.title,
        channelTitle: video.channelTitle,
        thumbnailUrl: video.thumbnailUrl,
        viewCount: video.viewCount,
        duration: video.duration,
        publishedAt: video.publishedAt,
        submittedAt,
      });
    return this.findById(Number(result.lastInsertRowid))!;
  }

  attachAdminMessage(id: number, channelId: string, messageId: string): void {
    getDatabase()
      .prepare("UPDATE song_submissions SET admin_channel_id = ?, admin_message_id = ? WHERE id = ?")
      .run(channelId, messageId, id);
  }

  approveIfPending(id: number, reviewerId: string, viewCountAtApproval: number): boolean {
    const database = getDatabase();
    return database.transaction(() => {
      const pending = database.prepare("SELECT * FROM song_submissions WHERE id = ?").get(id) as
        | SubmissionRow
        | undefined;
      if (!pending || pending.status !== "PENDING") return false;
      const existing = database
        .prepare(
          "SELECT * FROM song_submissions WHERE guild_id = ? AND country_code = ? AND status = 'APPROVED' LIMIT 1",
        )
        .get(pending.guild_id, pending.country_code) as SubmissionRow | undefined;
      if (existing?.locked === 1) throw new Error("ENTRY_LOCKED");

      const reviewedAt = new Date().toISOString();
      if (existing) {
        database
          .prepare(
            `UPDATE song_submissions SET status = 'REJECTED', locked = 0,
             reviewed_at = ?, reviewed_by = ?, rejection_reason = 'Yeni resmi şarkı onaylandı.'
             WHERE id = ? AND status = 'APPROVED'`,
          )
          .run(reviewedAt, reviewerId, existing.id);
      }
      const result = database
        .prepare(
          `UPDATE song_submissions
           SET status = 'APPROVED', locked = 1, reviewed_at = ?, reviewed_by = ?,
               view_count_at_approval = ?, replaces_submission_id = ?
           WHERE id = ? AND status = 'PENDING'`,
        )
        .run(reviewedAt, reviewerId, viewCountAtApproval, existing?.id ?? null, id);
      return result.changes === 1;
    })();
  }

  revertApproval(id: number, reviewerId: string): boolean {
    const database = getDatabase();
    return database.transaction(() => {
      const current = database.prepare("SELECT * FROM song_submissions WHERE id = ?").get(id) as
        | SubmissionRow
        | undefined;
      if (!current || current.status !== "APPROVED" || current.reviewed_by !== reviewerId) return false;
      database
        .prepare(
          `UPDATE song_submissions SET status = 'PENDING', locked = 0, reviewed_at = NULL,
           reviewed_by = NULL, view_count_at_approval = NULL, replaces_submission_id = NULL
           WHERE id = ?`,
        )
        .run(id);
      if (current.replaces_submission_id) {
        database
          .prepare(
            `UPDATE song_submissions SET status = 'APPROVED', rejection_reason = NULL,
             reviewed_at = ?, reviewed_by = ?, locked = 0 WHERE id = ? AND status = 'REJECTED'`,
          )
          .run(new Date().toISOString(), reviewerId, current.replaces_submission_id);
      }
      return true;
    })();
  }

  setLock(guildId: string, countryCode: string, locked: boolean): SongSubmission | null {
    const result = getDatabase()
      .prepare(
        "UPDATE song_submissions SET locked = ? WHERE guild_id = ? AND country_code = ? AND status = 'APPROVED'",
      )
      .run(locked ? 1 : 0, guildId, countryCode);
    return result.changes === 1 ? this.findApprovedByCountry(guildId, countryCode) : null;
  }

  removeApproved(guildId: string, countryCode: string, reviewerId: string): SongSubmission | null {
    const current = this.findApprovedByCountry(guildId, countryCode);
    if (!current) return null;
    const result = getDatabase()
      .prepare(
        `UPDATE song_submissions
         SET status = 'REJECTED', locked = 0, reviewed_at = ?, reviewed_by = ?,
             rejection_reason = 'Resmi şarkı yönetici tarafından kaldırıldı.'
         WHERE id = ? AND status = 'APPROVED'`,
      )
      .run(new Date().toISOString(), reviewerId, current.id);
    return result.changes === 1 ? current : null;
  }

  rejectIfPending(id: number, reviewerId: string, reason: string): boolean {
    const reviewedAt = new Date().toISOString();
    const result = getDatabase()
      .prepare(
        `UPDATE song_submissions
         SET status = 'REJECTED', reviewed_at = ?, reviewed_by = ?, rejection_reason = ?
         WHERE id = ? AND status = 'PENDING'`,
      )
      .run(reviewedAt, reviewerId, reason, id);
    return result.changes === 1;
  }

  rejectSystemFailure(id: number, reason: string): void {
    getDatabase()
      .prepare(
        `UPDATE song_submissions
         SET status = 'REJECTED', reviewed_at = ?, rejection_reason = ?
         WHERE id = ? AND status = 'PENDING'`,
      )
      .run(new Date().toISOString(), reason, id);
  }
}
