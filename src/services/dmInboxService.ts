import { ChannelType, EmbedBuilder, type Client, type Message } from "discord.js";
import type { GuildConfigService } from "./guildConfigService.js";
import type { LogService } from "./logService.js";

interface DmDestination {
  guildId: string;
  channelId: string;
}

export function selectDmInboxDestinations(
  configured: DmDestination[],
  memberGuildIds: ReadonlySet<string>,
): DmDestination[] {
  if (configured.length <= 1) return configured;
  return configured.filter((destination) => memberGuildIds.has(destination.guildId));
}

function attachmentFields(message: Message): Array<{ name: string; value: string }> {
  const lines = [
    ...[...message.attachments.values()].map((attachment) =>
      `[${attachment.name ?? "Dosya"}](${attachment.url})${attachment.size ? ` — ${attachment.size.toLocaleString("tr-TR")} bayt` : ""}`,
    ),
    ...[...message.stickers.values()].map((sticker) => `Sticker: **${sticker.name}** — ${sticker.url}`),
  ];
  if (lines.length === 0) return [];

  const chunks: string[] = [];
  let current = "";
  for (const line of lines) {
    if (current && `${current}\n${line}`.length > 1_024) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) chunks.push(current);
  return chunks.map((value, index) => ({
    name: index === 0 ? "Ekler" : `Ekler (${index + 1})`,
    value: value.slice(0, 1_024),
  }));
}

export class DmInboxService {
  constructor(
    private readonly client: Client,
    private readonly configs: GuildConfigService,
    private readonly logs: LogService,
  ) {}

  async forward(message: Message): Promise<void> {
    if (message.author.bot || message.inGuild() || message.channel.type !== ChannelType.DM) return;

    const configured = [...this.client.guilds.cache.values()].flatMap((guild) => {
      const channelId = this.configs.get(guild.id).channels.dmInbox;
      return channelId ? [{ guildId: guild.id, channelId }] : [];
    });
    if (configured.length === 0) return;

    let memberGuildIds = new Set<string>();
    if (configured.length > 1) {
      const memberships = await Promise.all(
        configured.map(async ({ guildId }) => {
          const guild = this.client.guilds.cache.get(guildId);
          if (!guild) return null;
          const member = await guild.members.fetch(message.author.id).catch(() => null);
          return member ? guildId : null;
        }),
      );
      memberGuildIds = new Set(memberships.filter((guildId): guildId is string => guildId !== null));
    }

    const destinations = selectDmInboxDestinations(configured, memberGuildIds);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({
        name: `${message.author.tag} tarafından gönderildi`,
        iconURL: message.author.displayAvatarURL(),
      })
      .setTitle("📩 Yeni Bot DM'i")
      .setDescription(message.content.trim() || "*Mesaj metni yok.*")
      .addFields(
        { name: "Kullanıcı", value: `<@${message.author.id}>`, inline: true },
        { name: "Kullanıcı ID", value: message.author.id, inline: true },
        { name: "DM Mesaj ID", value: message.id, inline: true },
        ...attachmentFields(message),
      )
      .setTimestamp(message.createdAt);

    for (const destination of destinations) {
      try {
        const channel = await this.client.channels.fetch(destination.channelId);
        if (!channel || channel.type !== ChannelType.GuildText || channel.guildId !== destination.guildId) {
          throw new Error("Ayarlı DM gelen kutusu kanalı bulunamadı veya metin kanalı değil.");
        }
        await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      } catch (error) {
        await this.logs.error(destination.guildId, "Kullanıcı DM'i gelen kutusu kanalına iletilemedi.", error);
      }
    }
  }
}
