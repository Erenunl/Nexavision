import { EmbedBuilder } from "discord.js";
import type { SongSubmission } from "../types/submission.js";
import { formatNumber } from "../utils/format.js";

export function buildOfficialEntryEmbed(submission: SongSubmission): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`${submission.countryFlag} ${submission.countryName.toLocaleUpperCase("tr-TR")}’NİN RESMİ ŞARKISI SEÇİLDİ!`)
    .setDescription(`[${submission.songTitle}](${submission.youtubeUrl})`)
    .addFields(
      { name: "Ülke", value: `${submission.countryFlag} ${submission.countryName}`, inline: true },
      { name: "Sanatçı / Kanal", value: submission.youtubeChannelName, inline: true },
      {
        name: "Seçim anındaki görüntülenme",
        value: formatNumber(submission.viewCountAtApproval ?? submission.viewCountAtSubmission),
        inline: false,
      },
    )
    .setTimestamp();
  if (submission.thumbnailUrl) embed.setImage(submission.thumbnailUrl);
  return embed;
}
