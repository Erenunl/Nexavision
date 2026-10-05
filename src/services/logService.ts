import { ChannelType, type Client } from "discord.js";
import type { GuildConfigService } from "./guildConfigService.js";

export class LogService {
  constructor(
    private readonly client: Client,
    private readonly configs: GuildConfigService,
  ) {}

  async error(guildId: string, summary: string, error?: unknown): Promise<void> {
    console.error(summary, error);
    const channelId = this.configs.get(guildId).channels.logs;
    if (!channelId) return;
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel?.type === ChannelType.GuildText && channel.guildId === guildId) {
        const detail = error instanceof Error ? `\n\`${error.message.slice(0, 1_500)}\`` : "";
        await channel.send(`⚠️ ${summary}${detail}`);
      }
    } catch (logError) {
      console.error("Log kanalına yazılamadı:", logError);
    }
  }

  async info(guildId: string, summary: string): Promise<void> {
    console.log(summary);
    const channelId = this.configs.get(guildId).channels.logs;
    if (!channelId) return;
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel?.type === ChannelType.GuildText && channel.guildId === guildId) {
        await channel.send({ content: `ℹ️ ${summary}`, allowedMentions: { parse: [] } });
      }
    } catch (error) {
      console.error("Bilgi logu kanalına yazılamadı:", error);
    }
  }

  debug(summary: string, error?: unknown): void {
    console.warn(`[DEBUG] ${summary}`, error ?? "");
  }
}
