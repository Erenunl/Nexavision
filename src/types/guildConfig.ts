export interface GuildConfig {
  type: "guild_config";
  version: 4;
  guildId: string;
  channels: {
    songSubmission: string | null;
    adminApproval: string | null;
    officialEntries: string | null;
    logs: string | null;
    countryList: string | null;
    countryApplication: string | null;
    stage: string | null;
    contestStatus: string | null;
    results: string | null;
    scoreboard: string | null;
    nowPlaying: string | null;
  };
  roles: {
    admin: string | null;
    winner: string | null;
  };
  songRules: {
    maxViewCount: number;
  };
  deadlines: {
    songSubmission: number | null;
    voting: number | null;
  };
  votingOpen: boolean;
  countryApplicationsOpen: boolean;
  countryRolesInitialized: boolean;
  countryRoles: Record<string, string>;
  messages: {
    countryList: string | null;
    countryApplication: string | null;
    contestStatus: string | null;
    scoreboard: string | null;
    nowPlaying: string | null;
  };
}

export type ConfigChannelKey = keyof GuildConfig["channels"];
export type ConfigMessageKey = keyof GuildConfig["messages"];
