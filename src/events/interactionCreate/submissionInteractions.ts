import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Interaction,
} from "discord.js";
import { CUSTOM_IDS } from "../../config/constants.js";
import type { SubmissionRepository } from "../../database/submissionRepository.js";
import { buildOfficialEntryEmbed } from "../../embeds/officialEntryEmbed.js";
import { buildReviewButtons, buildSubmissionEmbed } from "../../embeds/submissionEmbed.js";
import type { AuthorizationService } from "../../services/authorizationService.js";
import type { GuildConfigService } from "../../services/guildConfigService.js";
import type { LogService } from "../../services/logService.js";
import type { YouTubeService } from "../../services/youtubeService.js";
import { formatNumber } from "../../utils/format.js";
import type { ContestStatusService } from "../../services/contestStatusService.js";
import type { OfficialEntryMessageRepository } from "../../database/officialEntryMessageRepository.js";

function parseSubmissionId(customId: string, prefix: string): number | null {
  const raw = customId.slice(prefix.length);
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function ensureReviewer(
  interaction: Interaction,
  authorization: AuthorizationService,
): Promise<boolean> {
  if (!interaction.inCachedGuild()) return false;
  const member = interaction.member;
  if (authorization.canReviewSongs(interaction.guild, member)) return true;
  if (interaction.isRepliable()) {
    await interaction.reply({
      content: "Bu başvuruyu incelemek için yapılandırılmış admin rolüne sahip olmalısın.",
      flags: MessageFlags.Ephemeral,
    });
  }
  return false;
}

export async function handleSubmissionInteraction(
  interaction: Interaction,
  dependencies: {
    configs: GuildConfigService;
    authorization: AuthorizationService;
    submissions: SubmissionRepository;
    logs: LogService;
    youtube: YouTubeService;
    contestStatus: ContestStatusService;
    officialMessages: OfficialEntryMessageRepository;
  },
): Promise<boolean> {
  const { configs, authorization, submissions, logs, youtube, contestStatus, officialMessages } = dependencies;
  const customId = "customId" in interaction ? interaction.customId : "";
  const isSongInteraction =
    customId.startsWith(CUSTOM_IDS.approvePrefix) ||
    customId.startsWith(CUSTOM_IDS.rejectPrefix) ||
    customId.startsWith(CUSTOM_IDS.rejectModalPrefix);
  if (!isSongInteraction) return false;
  if (!(await ensureReviewer(interaction, authorization))) return true;
  if (!interaction.inCachedGuild()) return true;

  if (interaction.isButton() && customId.startsWith(CUSTOM_IDS.approvePrefix)) {
    const id = parseSubmissionId(customId, CUSTOM_IDS.approvePrefix);
    const submission = id ? submissions.findById(id) : null;
    if (!submission || submission.guildId !== interaction.guildId) {
      await interaction.reply({ content: "Başvuru bulunamadı.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (submission.status !== "PENDING") {
      await interaction.reply({ content: "Bu başvuru daha önce sonuçlandırılmış.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const officialChannelId = configs.get(interaction.guildId).channels.officialEntries;
    const officialChannel = officialChannelId
      ? await interaction.client.channels.fetch(officialChannelId).catch(() => null)
      : null;
    if (!officialChannel?.isSendable() || !("guildId" in officialChannel) || officialChannel.guildId !== interaction.guildId) {
      await interaction.reply({
        content: "Resmi şarkılar kanalı ayarlanmamış veya artık mevcut değil.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await interaction.deferUpdate();
    const lookup = await youtube.getVideo(submission.youtubeVideoId);
    if (!lookup.ok) {
      if (lookup.kind === "temporary") {
        await logs.error(interaction.guildId, `#${submission.id} onayında YouTube kontrolü başarısız.`, lookup.error);
        await interaction.followUp({
          content: "Video şu anda yeniden kontrol edilemedi. Biraz sonra tekrar deneyin.",
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.followUp({
          content: "Video artık mevcut, herkese açık veya erişilebilir değil; başvuru onaylanmadı.",
          flags: MessageFlags.Ephemeral,
        });
      }
      return true;
    }

    const currentLimit = configs.get(interaction.guildId).songRules.maxViewCount;
    if (
      lookup.video.liveBroadcastContent === "live" ||
      lookup.video.liveBroadcastContent === "upcoming" ||
      lookup.video.viewCount >= currentLimit
    ) {
      const detail =
        lookup.video.liveBroadcastContent === "none"
          ? `Video artık ${formatNumber(lookup.video.viewCount)} görüntülenmeye sahip; limit ${formatNumber(currentLimit)}.`
          : "Video şu anda aktif veya planlanmış canlı yayın durumunda.";
      await interaction.followUp({
        content: `${detail} Başvuru onaylanmadı.`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    try {
      if (!submissions.approveIfPending(submission.id, interaction.user.id, lookup.video.viewCount)) {
        await interaction.followUp({ content: "Bu başvuru başka bir yönetici tarafından sonuçlandırıldı.", flags: MessageFlags.Ephemeral });
        return true;
      }
    } catch (error) {
      await logs.error(interaction.guildId, `#${submission.id} başvurusu onaylanamadı.`, error);
      await interaction.followUp({
        content: "Bu video veya ülke için başka bir resmi şarkı zaten onaylanmış olabilir.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const approved = submissions.findById(submission.id)!;
    try {
      const reference=officialMessages.get(interaction.guildId,approved.countryCode);let officialMessage=null;if(reference&&'messages'in officialChannel){officialMessage=await officialChannel.messages.fetch(reference.messageId).catch(()=>null);}if(officialMessage)await officialMessage.edit({embeds:[buildOfficialEntryEmbed(approved)]});else{officialMessage=await officialChannel.send({ embeds: [buildOfficialEntryEmbed(approved)] });officialMessages.set(interaction.guildId,approved.countryCode,officialChannel.id,officialMessage.id);}
    } catch (error) {
      submissions.revertApproval(submission.id, interaction.user.id);
      await logs.error(interaction.guildId, `#${submission.id} resmi duyurusu gönderilemedi; onay geri alındı.`, error);
      await interaction.followUp({
        content: "Resmi duyuru gönderilemedi. Başvuru beklemede bırakıldı; kanal izinlerini kontrol edip tekrar deneyin.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await interaction.editReply({
      embeds: [buildSubmissionEmbed(approved)],
      components: [buildReviewButtons(approved.id, true)],
    });
    await contestStatus.sync(interaction.guildId).catch((error) =>
      logs.error(interaction.guildId, "Şarkı onayı sonrası durum paneli güncellenemedi.", error),
    );
    return true;
  }

  if (interaction.isButton() && customId.startsWith(CUSTOM_IDS.rejectPrefix)) {
    const id = parseSubmissionId(customId, CUSTOM_IDS.rejectPrefix);
    const submission = id ? submissions.findById(id) : null;
    if (!submission || submission.guildId !== interaction.guildId) {
      await interaction.reply({ content: "Başvuru bulunamadı.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (submission.status !== "PENDING") {
      await interaction.reply({ content: "Bu başvuru daha önce sonuçlandırılmış.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const reasonInput = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Ret sebebi")
      .setStyle(TextInputStyle.Paragraph)
      .setMinLength(3)
      .setMaxLength(1_000)
      .setRequired(true);
    const modal = new ModalBuilder()
      .setCustomId(`${CUSTOM_IDS.rejectModalPrefix}${submission.id}`)
      .setTitle("Şarkı Başvurusunu Reddet")
      .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && customId.startsWith(CUSTOM_IDS.rejectModalPrefix)) {
    const id = parseSubmissionId(customId, CUSTOM_IDS.rejectModalPrefix);
    const submission = id ? submissions.findById(id) : null;
    if (!submission || submission.guildId !== interaction.guildId) {
      await interaction.reply({ content: "Başvuru bulunamadı.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const reason = interaction.fields.getTextInputValue("reason").trim();
    if (reason.length < 3) {
      await interaction.reply({ content: "Ret sebebi en az 3 karakter olmalı.", flags: MessageFlags.Ephemeral });
      return true;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!submissions.rejectIfPending(submission.id, interaction.user.id, reason)) {
      await interaction.editReply("Bu başvuru başka bir yönetici tarafından sonuçlandırıldı.");
      return true;
    }

    const rejected = submissions.findById(submission.id)!;
    if (rejected.adminChannelId && rejected.adminMessageId) {
      try {
        const channel = await interaction.client.channels.fetch(rejected.adminChannelId);
        if (channel?.isTextBased() && "messages" in channel) {
          const adminMessage = await channel.messages.fetch(rejected.adminMessageId);
          await adminMessage.edit({
            embeds: [buildSubmissionEmbed(rejected)],
            components: [buildReviewButtons(rejected.id, true)],
          });
        }
      } catch (error) {
        await logs.error(interaction.guildId, `#${rejected.id} admin mesajı güncellenemedi.`, error);
      }
    }

    try {
      const user = await interaction.client.users.fetch(rejected.discordUserId);
      await user.send(
        `${rejected.countryName} için gönderdiğin şarkı yönetici tarafından reddedildi.\n\nSebep: ${reason}`,
      );
    } catch {
      // Kullanıcının DM'leri kapalı olabilir; ret işlemi bundan etkilenmez.
    }

    await interaction.editReply("✅ Başvuru reddedildi ve kayıt güncellendi.");
    await contestStatus.sync(interaction.guildId).catch((error) =>
      logs.error(interaction.guildId, "Şarkı reddi sonrası durum paneli güncellenemedi.", error),
    );
    return true;
  }

  return true;
}
