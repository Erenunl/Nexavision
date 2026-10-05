import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { CUSTOM_IDS } from "../config/constants.js";
import type { SongSubmission } from "../types/submission.js";
import { discordTimestamp, formatIsoDuration, formatNumber } from "../utils/format.js";

const COLORS = {
  PENDING: 0xf1c40f,
  APPROVED: 0x2ecc71,
  REJECTED: 0xe74c3c,
} as const;

export function buildSubmissionEmbed(submission: SongSubmission): EmbedBuilder {
  const statusLabel = {
    PENDING: "BEKLİYOR",
    APPROVED: "ONAYLANDI",
    REJECTED: "REDDEDİLDİ",
  }[submission.status];

  const embed = new EmbedBuilder()
    .setColor(COLORS[submission.status])
    .setTitle(`${submission.countryFlag} ${submission.countryName} — ${statusLabel}`)
    .setDescription(`[${submission.songTitle}](${submission.youtubeUrl})`)
    .addFields(
      { name: "Gönderen", value: `<@${submission.discordUserId}>`, inline: true },
      { name: "YouTube kanalı", value: submission.youtubeChannelName, inline: true },
      {
        name: submission.status === "APPROVED" ? "Seçim anındaki görüntülenme" : "Başvuru anındaki görüntülenme",
        value: formatNumber(submission.viewCountAtApproval ?? submission.viewCountAtSubmission),
        inline: true,
      },
      { name: "Süre", value: formatIsoDuration(submission.duration), inline: true },
      { name: "Yayın tarihi", value: discordTimestamp(submission.publishedAt), inline: true },
      { name: "Başvuru", value: `#${submission.id}`, inline: true },
    )
    .setTimestamp(new Date(submission.submittedAt));

  if (submission.thumbnailUrl) embed.setThumbnail(submission.thumbnailUrl);
  if (submission.reviewedBy) {
    embed.addFields({ name: "İnceleyen", value: `<@${submission.reviewedBy}>`, inline: true });
  }
  if (submission.rejectionReason) {
    embed.addFields({ name: "Ret sebebi", value: submission.rejectionReason.slice(0, 1_024) });
  }
  return embed;
}

export function buildReviewButtons(submissionId: number, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_IDS.approvePrefix}${submissionId}`)
      .setLabel("Onayla")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_IDS.rejectPrefix}${submissionId}`)
      .setLabel("Reddet")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}
