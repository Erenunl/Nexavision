import { ChannelType, DiscordAPIError, type Client, type TextChannel } from "discord.js";
import { EUROVISION_COUNTRIES, getCountry } from "../config/countries.js";
import { DATA_CHANNEL_ID } from "../config/constants.js";
import type { CountryAssignmentRepository } from "../database/countryAssignmentRepository.js";

export const COUNTRY_ASSIGNMENT_STATE_PREFIX = "FSC_COUNTRY_ASSIGNMENTS:";
const SNOWFLAKE = /^\d{17,20}$/;

export interface CountryAssignmentSnapshotEntry {
  countryCode: string;
  discordUserId: string;
}

export interface CountryAssignmentSnapshot {
  guildId: string;
  assignments: CountryAssignmentSnapshotEntry[];
}

export function serializeCountryAssignmentSnapshot(
  guildId: string,
  assignments: CountryAssignmentSnapshotEntry[],
): string {
  const compact = assignments
    .map((assignment) => [assignment.countryCode, assignment.discordUserId] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return `${COUNTRY_ASSIGNMENT_STATE_PREFIX}${guildId}\n${JSON.stringify({ v: 1, a: compact })}`;
}

export function parseCountryAssignmentSnapshot(content: string): CountryAssignmentSnapshot | null {
  if (!content.startsWith(COUNTRY_ASSIGNMENT_STATE_PREFIX)) return null;
  const newline = content.indexOf("\n");
  if (newline < 0) return null;
  const guildId = content.slice(COUNTRY_ASSIGNMENT_STATE_PREFIX.length, newline).trim();
  if (!SNOWFLAKE.test(guildId)) return null;

  try {
    const raw = JSON.parse(content.slice(newline + 1)) as { v?: unknown; a?: unknown };
    if (raw.v !== 1 || !Array.isArray(raw.a)) return null;
    const countryCodes = new Set<string>();
    const userIds = new Set<string>();
    const assignments: CountryAssignmentSnapshotEntry[] = [];
    for (const entry of raw.a) {
      if (!Array.isArray(entry) || entry.length !== 2) return null;
      const countryCode = typeof entry[0] === "string" ? entry[0].toUpperCase() : "";
      const discordUserId = typeof entry[1] === "string" ? entry[1] : "";
      if (
        !getCountry(countryCode) ||
        !SNOWFLAKE.test(discordUserId) ||
        countryCodes.has(countryCode) ||
        userIds.has(discordUserId)
      ) return null;
      countryCodes.add(countryCode);
      userIds.add(discordUserId);
      assignments.push({ countryCode, discordUserId });
    }
    return { guildId, assignments };
  } catch {
    return null;
  }
}

export class CountryAssignmentStateService {
  private dataChannel: TextChannel | null = null;
  private readonly messageIds = new Map<string, string>();

  constructor(
    private readonly client: Client,
    private readonly assignments: CountryAssignmentRepository,
  ) {}

  async initialize(): Promise<void> {
    const channel = await this.client.channels.fetch(DATA_CHANNEL_ID);
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error(`Assignment data kanalı (${DATA_CHANNEL_ID}) bulunamadı veya metin kanalı değil.`);
    }
    this.dataChannel = channel;

    const snapshots = new Map<string, CountryAssignmentSnapshot>();
    let before: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const messages = await channel.messages.fetch({ limit: 100, before });
      if (messages.size === 0) break;
      for (const message of messages.values()) {
        if (message.author.id !== this.client.user?.id) continue;
        const snapshot = parseCountryAssignmentSnapshot(message.content);
        if (!snapshot || snapshots.has(snapshot.guildId)) continue;
        snapshots.set(snapshot.guildId, snapshot);
        this.messageIds.set(snapshot.guildId, message.id);
      }
      before = messages.last()?.id;
      if (messages.size < 100) break;
    }

    for (const guild of this.client.guilds.cache.values()) {
      const snapshot = snapshots.get(guild.id);
      if (snapshot) {
        this.assignments.replaceActiveSnapshot(
          guild.id,
          snapshot.assignments,
          this.client.user?.id ?? "SYSTEM_RESTORE",
        );
      } else {
        await this.sync(guild.id);
      }
    }
  }

  async sync(guildId: string): Promise<void> {
    if (!this.dataChannel) throw new Error("Assignment state service henüz başlatılmadı.");
    const content = serializeCountryAssignmentSnapshot(
      guildId,
      this.assignments.listActive(guildId),
    );
    if (content.length > 2_000) {
      throw new Error(`Assignment snapshot Discord sınırını aşıyor (${content.length}).`);
    }

    const existingMessageId = this.messageIds.get(guildId);
    if (existingMessageId) {
      try {
        const existing = await this.dataChannel.messages.fetch(existingMessageId);
        if (existing.content !== content) await existing.edit(content);
        return;
      } catch (error) {
        if (!(error instanceof DiscordAPIError) || error.code !== 10_008) throw error;
      }
    }
    const created = await this.dataChannel.send(content);
    this.messageIds.set(guildId, created.id);
  }
}

export function maximumCountryAssignmentSnapshotLength(guildId: string): number {
  return serializeCountryAssignmentSnapshot(
    guildId,
    EUROVISION_COUNTRIES.map((country, index) => ({
      countryCode: country.code,
      discordUserId: String(100_000_000_000_000_000n + BigInt(index)),
    })),
  ).length;
}
