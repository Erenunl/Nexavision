import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Interaction,
  type StageChannel,
} from "discord.js";
import { STAGE_MUSIC_COMMAND_NAMES } from "../../commands/stageMusicCommands.js";
import type { AuthorizationService } from "../../services/authorizationService.js";
import type { GuildConfigService } from "../../services/guildConfigService.js";
import type { LogService } from "../../services/logService.js";
import {
  MUSIC_DIRECTORY,
  type StageMusicService,
} from "../../services/stageMusicService.js";

interface StageMusicInteractionDependencies {
  authorization: AuthorizationService;
  configs: GuildConfigService;
  stageMusic: StageMusicService;
  logs: LogService;
}

const REQUIRED_STAGE_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.MuteMembers,
] as const;

async function getConfiguredStageChannel(
  interaction: ChatInputCommandInteraction<"cached">,
  dependencies: StageMusicInteractionDependencies,
): Promise<StageChannel | null> {
  const channelId = dependencies.configs.get(interaction.guildId).channels.stage;
  if (!channelId) {
    await interaction.editReply(
      "Stage kanalı ayarlanmamış. Önce `/ayar` → Kanal Ayarları → Sahne Kanalı bölümünü kullanın.",
    );
    return null;
  }

  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildStageVoice) {
    await interaction.editReply(
      "Ayarlanmış Stage kanalı bulunamadı veya artık bir Stage kanalı değil. Lütfen `/ayar` üzerinden yeniden seçin.",
    );
    return null;
  }

  const botMember = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
  const permissions = channel.permissionsFor(botMember);
  if (!permissions?.has(REQUIRED_STAGE_PERMISSIONS)) {
    await interaction.editReply(
      "Botun Stage kanalında Görüntüle, Bağlan, Konuş ve Üyeleri Sustur izinlerine ihtiyacı var. Bu izinler botun dinleyici yerine konuşmacı olabilmesi için gereklidir.",
    );
    return null;
  }
  return channel;
}

async function handleStart(
  interaction: ChatInputCommandInteraction<"cached">,
  dependencies: StageMusicInteractionDependencies,
): Promise<void> {
  const existing = dependencies.stageMusic.getStatus(interaction.guildId);
  if (existing.state === "PLAYING") {
    await interaction.editReply("Stage müziği zaten oynuyor.");
    return;
  }
  if (existing.state === "PAUSED") {
    await interaction.editReply("Stage müziği duraklatılmış durumda. Devam etmek için `/sahnedevam` kullanın.");
    return;
  }

  const channel = await getConfiguredStageChannel(interaction, dependencies);
  if (!channel) return;

  try {
    const result = await dependencies.stageMusic.start(interaction.guild, channel);
    if (result === "NO_TRACKS") {
      await interaction.editReply(
        `Müzik klasöründe MP3 bulunamadı. Dosyaları \`${MUSIC_DIRECTORY}\` klasörüne ekleyin.`,
      );
      return;
    }
    if (result === "ALREADY_ACTIVE") {
      await interaction.editReply("Bu sunucuda zaten aktif bir Stage müzik oturumu var.");
      return;
    }
    await dependencies.logs.info(
      interaction.guildId,
      `Stage müziği ${interaction.user.tag} tarafından #${channel.name} kanalında başlatıldı.`,
    );
    await interaction.editReply(`✅ Stage müziği <#${channel.id}> kanalında başlatıldı.`);
  } catch (error) {
    await dependencies.logs.error(interaction.guildId, "Stage müziği başlatılamadı.", error);
    await interaction.editReply(
      "Stage müziği başlatılamadı. Kanal izinlerini ve MP3 dosyalarının geçerli olduğunu kontrol edin.",
    );
  }
}

async function handlePause(
  interaction: ChatInputCommandInteraction<"cached">,
  dependencies: StageMusicInteractionDependencies,
): Promise<void> {
  const result = dependencies.stageMusic.pause(interaction.guildId);
  if (result === "NOT_PLAYING") {
    await interaction.editReply("Duraklatılabilecek aktif bir Stage müziği yok.");
    return;
  }
  if (result === "ALREADY_PAUSED") {
    await interaction.editReply("Stage müziği zaten duraklatılmış.");
    return;
  }
  await dependencies.logs.info(
    interaction.guildId,
    `Stage müziği ${interaction.user.tag} tarafından duraklatıldı.`,
  );
  await interaction.editReply("⏸️ Stage müziği duraklatıldı; bağlantı ve sıra korundu.");
}

async function handleResume(
  interaction: ChatInputCommandInteraction<"cached">,
  dependencies: StageMusicInteractionDependencies,
): Promise<void> {
  const result = dependencies.stageMusic.resume(interaction.guildId);
  if (result === "NOT_ACTIVE") {
    await interaction.editReply("Devam ettirilebilecek aktif bir Stage müzik oturumu yok.");
    return;
  }
  if (result === "NOT_PAUSED") {
    await interaction.editReply("Stage müziği duraklatılmış değil.");
    return;
  }
  await dependencies.logs.info(
    interaction.guildId,
    `Stage müziği ${interaction.user.tag} tarafından devam ettirildi.`,
  );
  await interaction.editReply("▶️ Stage müziği kaldığı yerden devam ediyor.");
}

async function handleStop(
  interaction: ChatInputCommandInteraction<"cached">,
  dependencies: StageMusicInteractionDependencies,
): Promise<void> {
  const result = dependencies.stageMusic.stop(interaction.guildId);
  if (result === "NOT_ACTIVE") {
    await interaction.editReply("Bitirilebilecek aktif bir Stage müzik oturumu yok.");
    return;
  }
  await dependencies.logs.info(
    interaction.guildId,
    `Stage müzik oturumu ${interaction.user.tag} tarafından bitirildi.`,
  );
  await interaction.editReply("⏹️ Stage müzik oturumu bitirildi ve bot kanaldan ayrıldı.");
}

export async function handleStageMusicInteraction(
  interaction: Interaction,
  dependencies: StageMusicInteractionDependencies,
): Promise<boolean> {
  if (
    !interaction.isChatInputCommand() ||
    !STAGE_MUSIC_COMMAND_NAMES.has(interaction.commandName)
  ) {
    return false;
  }
  if (!interaction.inCachedGuild()) return true;

  const member = interaction.member;
  if (!dependencies.authorization.canManageSettings(interaction.guild, member)) {
    await interaction.reply({
      content: "Bu Stage müzik komutunu kullanmak için yetkin bulunmuyor.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (interaction.commandName === "sahnebasla") {
    await handleStart(interaction, dependencies);
  } else if (interaction.commandName === "sahnedur") {
    await handlePause(interaction, dependencies);
  } else if (interaction.commandName === "sahnedevam") {
    await handleResume(interaction, dependencies);
  } else if (interaction.commandName === "sahnebit") {
    await handleStop(interaction, dependencies);
  }
  return true;
}
