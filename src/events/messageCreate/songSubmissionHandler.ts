import { ChannelType, type Message } from "discord.js";
import { TEMPORARY_MESSAGE_TTL_MS } from "../../config/constants.js";
import type { GuildConfigService } from "../../services/guildConfigService.js";
import type { LogService } from "../../services/logService.js";
import type { SubmissionService } from "../../services/submissionService.js";
import type { YouTubeService } from "../../services/youtubeService.js";
import type { SubmissionRepository } from "../../database/submissionRepository.js";
import type { ContestStatusService } from "../../services/contestStatusService.js";
import { buildReviewButtons, buildSubmissionEmbed } from "../../embeds/submissionEmbed.js";
import { extractHttpUrls, parseYouTubeUrl } from "../../utils/youtubeUrl.js";

async function temporaryReply(message: Message, content: string): Promise<void> {
  if (!message.channel.isSendable()) return;
  const response = await message.channel.send({
    content: `<@${message.author.id}> ${content}`,
    allowedMentions: { users: [message.author.id] },
  });
  const timer = setTimeout(() => void response.delete().catch(() => undefined), TEMPORARY_MESSAGE_TTL_MS);
  timer.unref();
}

export function createSongSubmissionHandler(dependencies: {
  configs: GuildConfigService;
  youtube: YouTubeService;
  submissions: SubmissionService;
  submissionRepository: SubmissionRepository;
  logs: LogService;
  contestStatus: ContestStatusService;
}) {
  const { configs, youtube, submissions, submissionRepository, logs, contestStatus } = dependencies;

  return async function handleSongSubmission(message: Message): Promise<void> {
    if (!message.inGuild() || message.author.bot) return;
    const config = configs.get(message.guildId);
    if (!config.channels.songSubmission || message.channelId !== config.channels.songSubmission) return;

    void message.delete().catch((error) =>
      logs.error(message.guildId, "Şarkı gönderim kanalındaki kullanıcı mesajı silinemedi.", error),
    );

    if (config.deadlines.songSubmission && Math.floor(Date.now() / 1_000) >= config.deadlines.songSubmission) {
      await temporaryReply(message, "Şarkı teslim süresi sona erdi.");
      return;
    }

    if (!config.channels.adminApproval) {
      await temporaryReply(message, "Admin onay kanalı henüz ayarlanmamış. Bir yönetici `/ayar` komutunu kullanmalı.");
      return;
    }

    const urls = extractHttpUrls(message.content);
    if (urls.length !== 1) {
      await temporaryReply(
        message,
        urls.length > 1
          ? "Her başvuruda yalnızca bir YouTube video linki gönderebilirsin."
          : "Bu kanal yalnızca şarkı başvuruları için kullanılabilir. Geçerli bir YouTube video linki gönder.",
      );
      return;
    }

    const parsed = parseYouTubeUrl(urls[0]!);
    if (!parsed.ok) {
      const reason =
        parsed.reason === "shorts"
          ? "YouTube Shorts linkleri kabul edilmiyor."
          : parsed.reason === "invalid_video_id"
            ? "YouTube video ID'si geçersiz."
            : "Yalnızca `youtube.com/watch?v=...` veya `youtu.be/...` video linkleri kabul edilir.";
      await temporaryReply(message, reason);
      return;
    }

    const participantValidation = submissions.validateParticipant(message.guildId, message.author.id);
    if (!participantValidation.ok) {
      await temporaryReply(message, participantValidation.message);
      return;
    }

    if (submissionRepository.hasApprovedVideo(message.guildId, parsed.videoId)) {
      await temporaryReply(message, "Bu video daha önce yarışmada kullanılmış.");
      return;
    }

    const lookup = await youtube.getVideo(parsed.videoId);
    if (!lookup.ok) {
      if (lookup.kind === "temporary") {
        await logs.error(message.guildId, `YouTube videosu kontrol edilemedi: ${parsed.videoId}`, lookup.error);
        await temporaryReply(message, "Video şu anda kontrol edilemedi. Lütfen biraz sonra tekrar dene.");
      } else {
        await temporaryReply(message, "Video bulunamadı, gizli veya erişilebilir değil.");
      }
      return;
    }

    const videoValidation = submissions.validateVideo(
      message.guildId,
      lookup.video,
      config.songRules.maxViewCount,
    );
    if (!videoValidation.ok) {
      await temporaryReply(message, videoValidation.message);
      return;
    }

    const approvalChannel = await message.client.channels.fetch(config.channels.adminApproval).catch(() => null);
    if (
      !approvalChannel ||
      approvalChannel.type !== ChannelType.GuildText ||
      approvalChannel.guildId !== message.guildId
    ) {
      await temporaryReply(message, "Kayıtlı admin onay kanalı artık mevcut değil. Bir yönetici `/ayar` komutunu kullanmalı.");
      return;
    }

    let submission;
    try {
      submission = submissions.createPending(message.guildId, participantValidation.value, lookup.video);
    } catch (error) {
      await logs.error(message.guildId, "Başvuru database'e kaydedilemedi.", error);
      await temporaryReply(message, "Başvurun kaydedilemedi. Bekleyen başka bir başvurun olmadığını kontrol edip tekrar dene.");
      return;
    }

    let adminMessage;
    try {
      adminMessage = await approvalChannel.send({
        embeds: [buildSubmissionEmbed(submission)],
        components: [buildReviewButtons(submission.id)],
      });
    } catch (error) {
      submissions.markDispatchFailed(submission.id);
      await logs.error(message.guildId, `#${submission.id} başvurusunun admin mesajı gönderilemedi.`, error);
      await temporaryReply(message, "Başvuru onay kanalına iletilemedi. Lütfen daha sonra tekrar dene.");
      return;
    }

    try {
      submissionRepository.attachAdminMessage(submission.id, approvalChannel.id, adminMessage.id);
    } catch (error) {
      await adminMessage.delete().catch(() => undefined);
      submissions.markDispatchFailed(submission.id);
      await logs.error(message.guildId, `#${submission.id} admin mesajı database'e bağlanamadı.`, error);
      await temporaryReply(message, "Başvurun kalıcı olarak kaydedilemedi. Lütfen daha sonra tekrar dene.");
      return;
    }

    await temporaryReply(message, "Başvurun otomatik kontrolleri geçti ve yönetici onayına gönderildi.");
    await contestStatus.sync(message.guildId).catch((error) =>
      logs.error(message.guildId, "Yeni şarkı başvurusu sonrası durum paneli güncellenemedi.", error),
    );
  };
}
