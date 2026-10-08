import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
} from "discord.js";
import { settingsCommand } from "./commands/settingsCommand.js";
import { countrySetupCommand } from "./commands/countrySetupCommand.js";
import { announcementCommand } from "./commands/announcementCommand.js";
import { stageMusicCommands } from "./commands/stageMusicCommands.js";
import { contestCommands } from "./commands/contestCommands.js";
import { env } from "./config/env.js";
import { openDatabase } from "./database/connection.js";
import { migrate } from "./database/migrate.js";
import { CountryAssignmentRepository } from "./database/countryAssignmentRepository.js";
import { CountryApplicationRepository } from "./database/countryApplicationRepository.js";
import { SubmissionRepository } from "./database/submissionRepository.js";
import { VoteRepository } from "./database/voteRepository.js";
import { ReminderRepository } from "./database/reminderRepository.js";
import { ResultRepository } from "./database/resultRepository.js";
import { SongChangeRequestRepository } from "./database/songChangeRequestRepository.js";
import { OfficialEntryMessageRepository } from "./database/officialEntryMessageRepository.js";
import { handleSettingsInteraction } from "./events/interactionCreate/settingsInteractions.js";
import { handleSubmissionInteraction } from "./events/interactionCreate/submissionInteractions.js";
import { handleCountryInteraction } from "./events/interactionCreate/countryInteractions.js";
import { handleCountrySetupInteraction } from "./events/interactionCreate/countrySetupInteraction.js";
import { handleAnnouncementInteraction } from "./events/interactionCreate/announcementInteraction.js";
import { handleStageMusicInteraction } from "./events/interactionCreate/stageMusicInteractions.js";
import { handleVotingInteraction } from "./events/interactionCreate/votingInteractions.js";
import { handleContestAdminInteraction } from "./events/interactionCreate/contestAdminInteractions.js";
import { handleSongChangeInteraction } from "./events/interactionCreate/songChangeInteractions.js";
import { createSongSubmissionHandler } from "./events/messageCreate/songSubmissionHandler.js";
import { AuthorizationService } from "./services/authorizationService.js";
import { GuildConfigService } from "./services/guildConfigService.js";
import { LogService } from "./services/logService.js";
import { SubmissionService } from "./services/submissionService.js";
import { YouTubeService } from "./services/youtubeService.js";
import { CountryRoleService } from "./services/countryRoleService.js";
import { CountryPanelService } from "./services/countryPanelService.js";
import { AnnouncementService } from "./services/announcementService.js";
import { StageMusicService } from "./services/stageMusicService.js";
import { ContestStatusService } from "./services/contestStatusService.js";
import { VotingService } from "./services/votingService.js";
import { ReminderService } from "./services/reminderService.js";
import { ResultService } from "./services/resultService.js";
import { NowPlayingService } from "./services/nowPlayingService.js";
import { SongSubmissionValidator } from "./validators/songSubmissionValidator.js";
import { acquireSingleInstanceLock } from "./utils/singleInstanceLock.js";
import { startHealthServer, type BotHealthState } from "./services/healthServer.js";
import { CountryAssignmentStateService } from "./services/countryAssignmentStateService.js";

acquireSingleInstanceLock("./data/nexavision.pid");

const database = openDatabase("./data/nexavision.sqlite");
migrate(database);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});

const configs = new GuildConfigService();
const countryAssignmentRepository = new CountryAssignmentRepository();
const countryApplicationRepository = new CountryApplicationRepository();
const submissionRepository = new SubmissionRepository();
const voteRepository = new VoteRepository();
const reminderRepository = new ReminderRepository();
const resultRepository = new ResultRepository();
const songChangeRequests = new SongChangeRequestRepository();
const officialEntryMessages = new OfficialEntryMessageRepository();
const validator = new SongSubmissionValidator(countryAssignmentRepository, submissionRepository);
const submissionService = new SubmissionService(submissionRepository, validator);
const youtube = new YouTubeService(env.youtubeApiKey);
const authorization = new AuthorizationService(configs);
const logs = new LogService(client, configs);
const countryRoles = new CountryRoleService(configs);
const countryPanels = new CountryPanelService(client, configs, countryAssignmentRepository);
const countryAssignmentState = new CountryAssignmentStateService(client, countryAssignmentRepository);
const announcements = new AnnouncementService();
const nowPlaying = new NowPlayingService(client, configs);
const stageMusic = new StageMusicService(logs, nowPlaying);
const contestStatus = new ContestStatusService(
  client,
  configs,
  countryAssignmentRepository,
  submissionRepository,
  voteRepository,
);
const voting = new VotingService(
  configs,
  countryAssignmentRepository,
  submissionRepository,
  voteRepository,
);
const reminders = new ReminderService(
  client,
  configs,
  countryAssignmentRepository,
  submissionRepository,
  voteRepository,
  reminderRepository,
  logs,
);
const results = new ResultService(client,configs,resultRepository,voteRepository,submissionRepository,countryAssignmentRepository);

let startupState: BotHealthState = "starting";
const webPort = Number(process.env.PORT ?? 8_000);
const healthServer = startHealthServer(webPort, () => startupState);

const songSubmissionHandler = createSongSubmissionHandler({
  configs,
  assignments: countryAssignmentRepository,
  youtube,
  submissions: submissionService,
  submissionRepository,
  logs,
  contestStatus,
});

client.on(Events.MessageCreate, async (message) => {
  if (startupState !== "ready") return;
  await songSubmissionHandler(message);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (startupState !== "ready") {
    if (interaction.isAutocomplete()) {
      await interaction.respond([]).catch(() => undefined);
    } else if (interaction.isRepliable()) {
      await interaction.reply({
        content:
          startupState === "failed"
            ? "Bot başlatılamadı. Lütfen bot konsolundaki başlangıç hatasını kontrol edin."
            : "Bot henüz başlatılıyor. Lütfen birkaç saniye sonra tekrar deneyin.",
        flags: MessageFlags.Ephemeral,
      }).catch(() => undefined);
    }
    return;
  }

  try {
    if (
      await handleSettingsInteraction(
        interaction,
        configs,
        authorization,
        countryPanels,
        logs,
        contestStatus,
        results,
        nowPlaying,
      )
    ) return;
    if (
      await handleCountrySetupInteraction(interaction, {
        authorization,
        roles: countryRoles,
        panels: countryPanels,
        logs,
      })
    ) return;
    if (
      await handleCountryInteraction(interaction, {
        configs,
        authorization,
        applications: countryApplicationRepository,
        roles: countryRoles,
        panels: countryPanels,
        logs,
        contestStatus,
        assignmentState: countryAssignmentState,
      })
    ) return;
    if (
      await handleAnnouncementInteraction(interaction, {
        authorization,
        announcements,
        logs,
      })
    ) return;
    if (
      await handleStageMusicInteraction(interaction, {
        authorization,
        configs,
        stageMusic,
        logs,
      })
    ) return;
    if (
      await handleContestAdminInteraction(interaction, {
        authorization,
        configs,
        assignments: countryAssignmentRepository,
        submissions: submissionRepository,
        votes: voteRepository,
        reminders,
        status: contestStatus,
        logs,
        results,
        countryRoles,
        countryPanels,
        assignmentState: countryAssignmentState,
        officialMessages: officialEntryMessages,
      })
    ) return;
    if (await handleSongChangeInteraction(interaction,{requests:songChangeRequests,officialMessages:officialEntryMessages,assignments:countryAssignmentRepository,submissions:submissionRepository,configs,submissionService,youtube,authorization,status:contestStatus,logs})) return;
    if (
      await handleVotingInteraction(interaction, {
        voting,
        votes: voteRepository,
        submissions: submissionRepository,
        status: contestStatus,
        logs,
      })
    ) return;
    await handleSubmissionInteraction(interaction, {
      configs,
      authorization,
      submissions: submissionRepository,
      logs,
      youtube,
      contestStatus,
      officialMessages: officialEntryMessages,
    });
  } catch (error) {
    console.error("Interaction işlenirken hata oluştu:", error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "İşlem sırasında beklenmeyen bir hata oluştu.",
        flags: MessageFlags.Ephemeral,
      }).catch(() => undefined);
    }
  }
});

client.once(Events.ClientReady, async (readyClient) => {
  try {
    await configs.initialize(readyClient);
    await countryAssignmentState.initialize();
    startupState = "ready";

    const commandPayloads = [
      settingsCommand.toJSON(),
      countrySetupCommand.toJSON(),
      announcementCommand.toJSON(),
      ...stageMusicCommands.map((command) => command.toJSON()),
      ...contestCommands.map((command) => command.toJSON()),
    ];
    for (const guild of readyClient.guilds.cache.values()) {
      try {
        await guild.commands.set(commandPayloads);
      } catch (error) {
        console.error(`${guild.name} sunucusunda komutlar kaydedilemedi:`, error);
      }
      try {
        await countryPanels.syncAll(guild.id);
      } catch (error) {
        await logs.error(guild.id, "Başlangıçta ülke listesi/paneli güncellenemedi.", error);
      }
      try {
        await contestStatus.sync(guild.id);
      } catch (error) {
        await logs.error(guild.id, "Başlangıçta yarışma durum paneli güncellenemedi.", error);
      }
      try { await results.syncScoreboard(guild.id); } catch (error) { await logs.error(guild.id,"Başlangıçta scoreboard güncellenemedi.",error); }
      try { await nowPlaying.update(guild.id,"STOPPED",null); } catch (error) { await logs.error(guild.id,"Başlangıçta Şimdi Çalıyor mesajı güncellenemedi.",error); }
    }

    console.log(`${readyClient.user.tag} olarak giriş yapıldı. ${readyClient.guilds.cache.size} sunucu hazır.`);
    reminders.start();
  } catch (error) {
    startupState = "failed";
    console.error("Bot başlatma işlemi tamamlanamadı:", error);
    healthServer.close();
    await client.destroy();
    process.exitCode = 1;
  }
});

client.on(Events.Error, (error) => console.error("Discord client hatası:", error));
client.login(env.discordToken).catch((error) => {
  startupState = "failed";
  console.error("Discord'a giriş yapılamadı:", error);
  healthServer.close();
  process.exitCode = 1;
});
