import { describe, expect, it } from "vitest";
import { EUROVISION_COUNTRIES } from "../src/config/countries.js";
import { CONFIG_MESSAGE_PREFIX, DEFAULT_MAX_VIEW_COUNT } from "../src/config/constants.js";
import { defaultGuildConfig, serializeGuildConfig, validateGuildConfig } from "../src/services/guildConfigService.js";

const guildId = "123456789012345678";

describe("validateGuildConfig", () => {
  it("default config'i kabul eder", () => {
    expect(validateGuildConfig(defaultGuildConfig(guildId), guildId)).toEqual(defaultGuildConfig(guildId));
  });

  it("tehlikeli/geçersiz alanları güvenli varsayılanlara çevirir", () => {
    const config = validateGuildConfig(
      {
        type: "guild_config",
        guildId,
        channels: { songSubmission: "not-an-id" },
        roles: { admin: 123 },
        songRules: { maxViewCount: -1 },
      },
      guildId,
    );
    expect(config?.channels.songSubmission).toBeNull();
    expect(config?.roles.admin).toBeNull();
    expect(config?.songRules.maxViewCount).toBe(DEFAULT_MAX_VIEW_COUNT);
    expect(config?.countryRolesInitialized).toBe(false);
    expect(config?.channels.countryList).toBeNull();
    expect(config?.channels.stage).toBeNull();
  });

  it("eski adminSongApproval alanını geriye uyumlu olarak taşır", () => {
    const config = validateGuildConfig(
      {
        type: "guild_config",
        version: 1,
        guildId,
        channels: { adminSongApproval: "234567890123456789" },
      },
      guildId,
    );
    expect(config?.version).toBe(4);
    expect(config?.channels.adminApproval).toBe("234567890123456789");
  });

  it("50 ülke rolüyle tek Discord mesajı sınırına sığar", () => {
    const config = defaultGuildConfig(guildId);
    config.countryRoles = Object.fromEntries(
      EUROVISION_COUNTRIES.map((country, index) => [
        country.code,
        String(1_000_000_000_000_000_000n + BigInt(index)),
      ]),
    );
    config.countryRolesInitialized = true;
    config.channels = {
      songSubmission: guildId,
      adminApproval: guildId,
      officialEntries: guildId,
      logs: guildId,
      countryList: guildId,
      countryApplication: guildId,
      stage: guildId,
      contestStatus: guildId,
      results: guildId,
      scoreboard: guildId,
      nowPlaying: guildId,
    };
    config.roles.admin = guildId;
    config.roles.winner = guildId;
    config.messages = { countryList: guildId, countryApplication: guildId, contestStatus: guildId, scoreboard: guildId, nowPlaying: guildId };
    config.deadlines = { songSubmission: 1_999_999_999, voting: 1_999_999_999 };
    config.votingOpen = true;
    const content = `${CONFIG_MESSAGE_PREFIX}${guildId}\n${serializeGuildConfig(config)}`;
    expect(content.length).toBeLessThanOrEqual(2_000);
    expect(validateGuildConfig(config, guildId)?.countryRolesInitialized).toBe(true);
  });
});
