import type { Client, Guild, TextChannel } from "discord.js";
import { ChannelType, DiscordAPIError } from "discord.js";
import {
  CONFIG_MESSAGE_PREFIX,
  CONFIG_VERSION,
  DATA_CHANNEL_ID,
  DEFAULT_MAX_VIEW_COUNT,
} from "../config/constants.js";
import { EUROVISION_COUNTRIES } from "../config/countries.js";
import type { ConfigChannelKey, ConfigMessageKey, GuildConfig } from "../types/guildConfig.js";

const SNOWFLAKE = /^\d{17,20}$/;
const CHANNEL_KEYS = ["songSubmission","adminApproval","officialEntries","logs","countryList","countryApplication","stage","contestStatus","results","scoreboard","nowPlaying","dmInbox"] as const;
const MESSAGE_KEYS = ["countryList","countryApplication","contestStatus","scoreboard","nowPlaying"] as const;

function nullableSnowflake(value: unknown): string | null {
  return typeof value === "string" && SNOWFLAKE.test(value) ? value : null;
}

function nullableTimestamp(value: unknown): number | null {
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) && timestamp > 0 ? timestamp : null;
}

export function defaultGuildConfig(guildId: string): GuildConfig {
  return {
    type: "guild_config",
    version: CONFIG_VERSION,
    guildId,
    channels: {
      songSubmission: null,
      adminApproval: null,
      officialEntries: null,
      logs: null,
      countryList: null,
      countryApplication: null,
      stage: null,
      contestStatus: null,
      results: null,
      scoreboard: null,
      nowPlaying: null,
      dmInbox: null,
    },
    roles: { admin: null, winner: null },
    songRules: { maxViewCount: DEFAULT_MAX_VIEW_COUNT },
    deadlines: { songSubmission: null, voting: null },
    votingOpen: false,
    countryApplicationsOpen: true,
    countryRolesInitialized: false,
    countryRoles: {},
    messages: {
      countryList: null,
      countryApplication: null,
      contestStatus: null,
      scoreboard: null,
      nowPlaying: null,
    },
  };
}

export function validateGuildConfig(value: unknown, guildId: string): GuildConfig | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.type !== "guild_config" || raw.guildId !== guildId) return null;

  const rawChannels = raw.channels;
  const channels = Array.isArray(rawChannels)
    ? Object.fromEntries(CHANNEL_KEYS.map((key,index)=>[key,rawChannels[index]])) as Record<string,unknown>
    : (raw.channels ?? {}) as Record<string, unknown>;
  const roles = Array.isArray(raw.roles)
    ? {admin:raw.roles[0],winner:raw.roles[1]} as Record<string,unknown>
    : (raw.roles ?? {}) as Record<string, unknown>;
  const rules = (raw.songRules ?? {}) as Record<string, unknown>;
  const rawCountryRoles = raw.countryRoles ?? {};
  const storedMessages = raw.messages;
  const rawMessages = Array.isArray(storedMessages)
    ? Object.fromEntries(MESSAGE_KEYS.map((key,index)=>[key,storedMessages[index]])) as Record<string,unknown>
    : (raw.messages ?? {}) as Record<string, unknown>;
  const rawDeadlines = Array.isArray(raw.deadlines)
    ? {songSubmission:raw.deadlines[0],voting:raw.deadlines[1]} as Record<string,unknown>
    : (raw.deadlines ?? {}) as Record<string, unknown>;
  const maxViewCount = Number(rules.maxViewCount);
  const countryRoles: Record<string, string> = {};
  for (const [index, country] of EUROVISION_COUNTRIES.entries()) {
    const roleId = nullableSnowflake(
      Array.isArray(rawCountryRoles)
        ? rawCountryRoles[index]
        : (rawCountryRoles as Record<string, unknown>)[country.code],
    );
    if (roleId) countryRoles[country.code] = roleId;
  }
  const allCountryRolesPresent = EUROVISION_COUNTRIES.every((country) => countryRoles[country.code]);

  return {
    type: "guild_config",
    version: CONFIG_VERSION,
    guildId,
    channels: {
      songSubmission: nullableSnowflake(channels.songSubmission),
      adminApproval:
        nullableSnowflake(channels.adminApproval) ?? nullableSnowflake(channels.adminSongApproval),
      officialEntries: nullableSnowflake(channels.officialEntries),
      logs: nullableSnowflake(channels.logs),
      countryList: nullableSnowflake(channels.countryList),
      countryApplication: nullableSnowflake(channels.countryApplication),
      stage: nullableSnowflake(channels.stage),
      contestStatus: nullableSnowflake(channels.contestStatus),
      results: nullableSnowflake(channels.results),
      scoreboard: nullableSnowflake(channels.scoreboard),
      nowPlaying: nullableSnowflake(channels.nowPlaying),
      dmInbox: nullableSnowflake(channels.dmInbox),
    },
    roles: { admin: nullableSnowflake(roles.admin), winner: nullableSnowflake(roles.winner) },
    songRules: {
      maxViewCount:
        Number.isSafeInteger(maxViewCount) && maxViewCount > 0 ? maxViewCount : DEFAULT_MAX_VIEW_COUNT,
    },
    deadlines: {
      songSubmission: nullableTimestamp(rawDeadlines.songSubmission),
      voting: nullableTimestamp(rawDeadlines.voting),
    },
    votingOpen: raw.votingOpen === true,
    countryApplicationsOpen: raw.countryApplicationsOpen !== false,
    countryRolesInitialized: raw.countryRolesInitialized === true && allCountryRolesPresent,
    countryRoles,
    messages: {
      countryList: nullableSnowflake(rawMessages.countryList),
      countryApplication: nullableSnowflake(rawMessages.countryApplication),
      contestStatus: nullableSnowflake(rawMessages.contestStatus),
      scoreboard: nullableSnowflake(rawMessages.scoreboard),
      nowPlaying: nullableSnowflake(rawMessages.nowPlaying),
    },
  };
}

export function serializeGuildConfig(config: GuildConfig): string {
  return JSON.stringify({
    ...config,
    channels: CHANNEL_KEYS.map((key)=>config.channels[key]),
    roles: [config.roles.admin,config.roles.winner],
    deadlines: [config.deadlines.songSubmission,config.deadlines.voting],
    countryRoles: EUROVISION_COUNTRIES.map((country) => config.countryRoles[country.code] ?? null),
    messages: MESSAGE_KEYS.map((key)=>config.messages[key]),
  });
}

export class GuildConfigService {
  private readonly cache = new Map<string, GuildConfig>();
  private readonly messageIds = new Map<string, string>();
  private dataChannel: TextChannel | null = null;

  async initialize(client: Client): Promise<void> {
    const channel = await client.channels.fetch(DATA_CHANNEL_ID);
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error(`Data kanalı (${DATA_CHANNEL_ID}) bulunamadı veya metin kanalı değil.`);
    }
    this.dataChannel = channel;

    let before: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const messages = await channel.messages.fetch({ limit: 100, before });
      if (messages.size === 0) break;

      for (const message of messages.values()) {
        if (message.author.id !== client.user?.id || !message.content.startsWith(CONFIG_MESSAGE_PREFIX)) continue;
        const newline = message.content.indexOf("\n");
        if (newline < 0) continue;
        const markerGuildId = message.content.slice(CONFIG_MESSAGE_PREFIX.length, newline).trim();
        try {
          const parsed = JSON.parse(message.content.slice(newline + 1)) as unknown;
          const config = validateGuildConfig(parsed, markerGuildId);
          if (config && !this.cache.has(markerGuildId)) {
            this.cache.set(markerGuildId, config);
            this.messageIds.set(markerGuildId, message.id);
          }
        } catch (error) {
          console.error(`Geçersiz config mesajı (${message.id}) atlandı:`, error);
        }
      }

      before = messages.last()?.id;
      if (messages.size < 100) break;
    }

    for (const guild of client.guilds.cache.values()) {
      if (!this.cache.has(guild.id)) {
        await this.save(defaultGuildConfig(guild.id));
      }
    }
  }

  get(guildId: string): GuildConfig {
    const existing = this.cache.get(guildId);
    if (existing) return existing;
    const created = defaultGuildConfig(guildId);
    this.cache.set(guildId, created);
    return created;
  }

  async setChannel(guildId: string, key: ConfigChannelKey, channelId: string): Promise<GuildConfig> {
    const current = this.get(guildId);
    return this.save({ ...current, channels: { ...current.channels, [key]: channelId } });
  }

  async setAdminRole(guildId: string, roleId: string): Promise<GuildConfig> {
    const current = this.get(guildId);
    return this.save({ ...current, roles: { ...current.roles, admin: roleId } });
  }

  async setWinnerRole(guildId: string, roleId: string): Promise<GuildConfig> {
    const current = this.get(guildId);
    return this.save({ ...current, roles: { ...current.roles, winner: roleId } });
  }

  async setMaxViewCount(guildId: string, maxViewCount: number): Promise<GuildConfig> {
    const current = this.get(guildId);
    return this.save({ ...current, songRules: { ...current.songRules, maxViewCount } });
  }

  async setDeadline(
    guildId: string,
    key: keyof GuildConfig["deadlines"],
    timestamp: number | null,
  ): Promise<GuildConfig> {
    const current = this.get(guildId);
    return this.save({ ...current, deadlines: { ...current.deadlines, [key]: timestamp } });
  }

  async setVotingOpen(guildId: string, votingOpen: boolean): Promise<GuildConfig> {
    const current = this.get(guildId);
    return this.save({ ...current, votingOpen });
  }

  async setCountryApplicationsOpen(guildId: string, open: boolean): Promise<GuildConfig> {
    const current = this.get(guildId);
    return this.save({ ...current, countryApplicationsOpen: open });
  }

  async setCountryRoleConfiguration(
    guildId: string,
    countryRoles: Record<string, string>,
    initialized: boolean,
  ): Promise<GuildConfig> {
    const current = this.get(guildId);
    return this.save({
      ...current,
      countryRoles: { ...countryRoles },
      countryRolesInitialized: initialized,
    });
  }

  async setMessageId(guildId: string, key: ConfigMessageKey, messageId: string): Promise<GuildConfig> {
    const current = this.get(guildId);
    if (current.messages[key] === messageId) return current;
    return this.save({ ...current, messages: { ...current.messages, [key]: messageId } });
  }

  describeMissing(config: GuildConfig): string[] {
    const labels: Array<[string | null, string]> = [
      [config.channels.adminApproval, "Admin onay kanalı"],
      [config.channels.officialEntries, "Resmi şarkılar kanalı"],
      [config.channels.countryList, "Ülke listesi kanalı"],
      [config.channels.countryApplication, "Ülke başvuru kanalı"],
      [config.roles.admin, "Admin rolü"],
    ];
    return labels.filter(([value]) => !value).map(([, label]) => label);
  }

  channelExists(guild: Guild, channelId: string | null): boolean {
    return Boolean(channelId && guild.channels.cache.has(channelId));
  }

  roleExists(guild: Guild, roleId: string | null): boolean {
    return Boolean(roleId && guild.roles.cache.has(roleId));
  }

  private async save(config: GuildConfig): Promise<GuildConfig> {
    if (!this.dataChannel) throw new Error("Config service henüz başlatılmadı.");
    const content = `${CONFIG_MESSAGE_PREFIX}${config.guildId}\n${serializeGuildConfig(config)}`;
    if (content.length > 2_000) {
      throw new Error(`Guild config mesajı Discord'un 2000 karakter sınırını aşıyor (${content.length}).`);
    }
    const existingMessageId = this.messageIds.get(config.guildId);

    let message;
    if (existingMessageId) {
      let existing = null;
      try {
        existing = await this.dataChannel.messages.fetch(existingMessageId);
      } catch (error) {
        if (!(error instanceof DiscordAPIError) || error.code !== 10_008) throw error;
        // Mesaj gerçekten silinmişse yeni source-of-truth mesajı oluşturulur.
      }
      if (existing) {
        message = await existing.edit(content);
      } else {
        message = await this.dataChannel.send(content);
      }
    } else {
      message = await this.dataChannel.send(content);
    }

    this.cache.set(config.guildId, config);
    this.messageIds.set(config.guildId, message.id);
    return config;
  }
}
