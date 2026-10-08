import { getDatabase } from "./connection.js";

export class OfficialEntryMessageRepository {
  get(guildId: string, countryCode: string) {
    return getDatabase()
      .prepare(
        "SELECT channel_id AS channelId, message_id AS messageId FROM official_entry_messages WHERE guild_id = ? AND country_code = ?",
      )
      .get(guildId, countryCode) as { channelId: string; messageId: string } | undefined;
  }

  set(guildId: string, countryCode: string, channelId: string, messageId: string): void {
    getDatabase()
      .prepare(
        `INSERT INTO official_entry_messages(guild_id, country_code, channel_id, message_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(guild_id, country_code)
         DO UPDATE SET channel_id = excluded.channel_id, message_id = excluded.message_id`,
      )
      .run(guildId, countryCode, channelId, messageId);
  }

  delete(guildId: string, countryCode: string): boolean {
    return (
      getDatabase()
        .prepare("DELETE FROM official_entry_messages WHERE guild_id = ? AND country_code = ?")
        .run(guildId, countryCode).changes === 1
    );
  }
}
