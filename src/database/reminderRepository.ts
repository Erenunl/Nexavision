import { getDatabase } from "./connection.js";

export type DeadlineType = "songSubmission" | "voting";

export class ReminderRepository {
  isProcessed(guildId: string, type: DeadlineType, deadline: number, thresholdHours: number): boolean {
    return Boolean(
      getDatabase()
        .prepare(
          `SELECT 1 FROM deadline_reminders
           WHERE guild_id = ? AND deadline_type = ? AND deadline_at = ? AND threshold_hours = ?`,
        )
        .get(guildId, type, deadline, thresholdHours),
    );
  }

  claim(guildId: string, type: DeadlineType, deadline: number, thresholdHours: number): boolean {
    return getDatabase()
      .prepare(
        `INSERT OR IGNORE INTO deadline_reminders
         (guild_id, deadline_type, deadline_at, threshold_hours, processed_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(guildId, type, deadline, thresholdHours, new Date().toISOString()).changes === 1;
  }

  finish(
    guildId: string,
    type: DeadlineType,
    deadline: number,
    thresholdHours: number,
    sent: number,
    failed: number,
  ): void {
    getDatabase()
      .prepare(
        `UPDATE deadline_reminders SET sent_count = ?, failed_count = ?
         WHERE guild_id = ? AND deadline_type = ? AND deadline_at = ? AND threshold_hours = ?`,
      )
      .run(sent, failed, guildId, type, deadline, thresholdHours);
  }
}
