import { ChannelType, type Message } from "discord.js";
import type { CountryAssignmentRepository } from "../../database/countryAssignmentRepository.js";
import type { GuildConfigService } from "../../services/guildConfigService.js";
import type { LogService } from "../../services/logService.js";
import type { SubmissionService } from "../../services/submissionService.js";
import type { YouTubeService } from "../../services/youtubeService.js";
import type { SubmissionRepository } from "../../database/submissionRepository.js";
import type { ContestStatusService } from "../../services/contestStatusService.js";
import { buildReviewButtons, buildSubmissionEmbed } from "../../embeds/submissionEmbed.js";
import { formatNumber } from "../../utils/format.js";
import { extractHttpUrls, parseYouTubeUrl } from "../../utils/youtubeUrl.js";

async function replyToDm(message: Message, content: string): Promise<void> {
  if (!message.channel.isSendable()) return;
  await message.channel.send({ content, allowedMentions: { parse: [] } });
}

export function findDmSubmissionGuilds(
  guildIds: Iterable<string>,
  userId: string,
  assignments: Pick<CountryAssignmentRepository, "findActiveByUser">,
): string[] {
  return [...guildIds].filter((guildId) => assignments.findActiveByUser(guildId, userId) !== null);
}

export function createSongSubmissionHandler(dependencies: {
  configs: GuildConfigService;
  assignments: CountryAssignmentRepository;
  youtube: YouTubeService;
  submissions: SubmissionService;
  submissionRepository: SubmissionRepository;
  logs: LogService;
  contestStatus: ContestStatusService;
}) {
  const { configs, assignments, youtube, submissions, submissionRepository, logs, contestStatus } = dependencies;

  return async function handleSongSubmission(message: Message): Promise<void> {
    if (message.author.bot || message.inGuild() || message.channel.type !== ChannelType.DM) return;

    const matchingGuildIds = findDmSubmissionGuilds(
      message.client.guilds.cache.keys(),
      message.author.id,
      assignments,
    );
    if (matchingGuildIds.length === 0) {
      await replyToDm(message, "Şarkı gönderebilmek için önce bir ülkede onaylanmış temsilci olmalısın.");
      return;
    }
    if (matchingGuildIds.length > 1) {
      await replyToDm(
        message,
        "Birden fazla sunucuda aktif temsilciliğin bulunduğu için başvurunun hangi yarışmaya ait olduğunu belirleyemedim. Lütfen bir yöneticiyle iletişime geç.",
      );
      return;
    }

    const guildId = matchingGuildIds[0]!;
    const config = configs.get(guildId);
    if (config.deadlines.songSubmission && Math.floor(Date.now() / 1_000) >= config.deadlines.songSubmission) {
      await replyToDm(message, "Şarkı teslim süresi sona erdi.");
      return;
    }

    if (!config.channels.adminApproval) {
      await replyToDm(message, "Admin onay kanalı henüz ayarlanmamış. Lütfen bir yöneticiyle iletişime geç.");
      return;
    }

    const urls = extractHttpUrls(message.content);
    if (urls.length !== 1) {
      await replyToDm(
        message,
        urls.length > 1
          ? "Her başvuruda yalnızca bir YouTube video linki gönderebilirsin."
          : "Şarkı başvurusu için bana tek bir `youtube.com/watch?v=...` veya `youtu.be/...` video linki gönder.",
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
      await replyToDm(message, reason);
      return;
    }

    const participantValidation = submissions.validateParticipant(guildId, message.author.id);
    if (!participantValidation.ok) {
      await replyToDm(message, participantValidation.message);
      return;
    }

    if (submissionRepository.hasApprovedVideo(guildId, parsed.videoId)) {
      await replyToDm(message, "Bu video daha önce yarışmada kullanılmış.");
      return;
    }

    const lookup = await youtube.getVideo(parsed.videoId);
    if (!lookup.ok) {
      if (lookup.kind === "temporary") {
        await logs.error(guildId, `YouTube videosu kontrol edilemedi: ${parsed.videoId}`, lookup.error);
        await replyToDm(message, "Video şu anda kontrol edilemedi. Lütfen biraz sonra tekrar dene.");
      } else {
        await replyToDm(message, "Video bulunamadı, gizli veya erişilebilir değil.");
      }
      return;
    }

    const videoValidation = submissions.validateVideo(
      guildId,
      lookup.video,
      config.songRules.maxViewCount,
    );
    if (!videoValidation.ok) {
      await replyToDm(message, videoValidation.message);
      return;
    }

    const approvalChannel = await message.client.channels.fetch(config.channels.adminApproval).catch(() => null);
    if (
      !approvalChannel ||
      approvalChannel.type !== ChannelType.GuildText ||
      approvalChannel.guildId !== guildId
    ) {
      await replyToDm(message, "Kayıtlı admin onay kanalı artık mevcut değil. Lütfen bir yöneticiyle iletişime geç.");
      return;
    }

    let submission;
    try {
      submission = submissions.createPending(guildId, participantValidation.value, lookup.video);
    } catch (error) {
      await logs.error(guildId, "DM şarkı başvurusu database'e kaydedilemedi.", error);
      await replyToDm(message, "Başvurun kaydedilemedi. Bekleyen başka bir başvurun olmadığını kontrol edip tekrar dene.");
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
      await logs.error(guildId, `#${submission.id} DM başvurusunun admin mesajı gönderilemedi.`, error);
      await replyToDm(message, "Başvuru onay kanalına iletilemedi. Lütfen daha sonra tekrar dene.");
      return;
    }

    try {
      submissionRepository.attachAdminMessage(submission.id, approvalChannel.id, adminMessage.id);
    } catch (error) {
      await adminMessage.delete().catch(() => undefined);
      submissions.markDispatchFailed(submission.id);
      await logs.error(guildId, `#${submission.id} admin mesajı database'e bağlanamadı.`, error);
      await replyToDm(message, "Başvurun kalıcı olarak kaydedilemedi. Lütfen daha sonra tekrar dene.");
      return;
    }

    await replyToDm(
      message,
      `✅ Şarkın bot kontrolünü geçti (${formatNumber(lookup.video.viewCount)} görüntülenme) ve yönetici onayına gönderildi. Sonuç yine DM üzerinden bildirilecek.`,
    );
    await logs.info(
      guildId,
      `${message.author.tag}, ${participantValidation.value.countryName} için DM üzerinden #${submission.id} şarkı başvurusu yaptı.`,
    );
    await contestStatus.sync(guildId).catch((error) =>
      logs.error(guildId, "Yeni DM şarkı başvurusu sonrası durum paneli güncellenemedi.", error),
    );
  };
}
