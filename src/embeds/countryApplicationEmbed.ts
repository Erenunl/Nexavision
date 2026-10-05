import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { getCountry } from "../config/countries.js";
import { CUSTOM_IDS } from "../config/constants.js";
import type { CountryApplication } from "../types/country.js";

const COLORS = {
  PENDING: 0xf1c40f,
  APPROVED: 0x2ecc71,
  REJECTED: 0xe74c3c,
} as const;

export function buildCountryApplicationEmbed(application: CountryApplication): EmbedBuilder {
  const country = getCountry(application.countryCode);
  const countryLabel = country ? `${country.flag} ${country.nameTr}` : application.countryCode;
  const statusLabel = {
    PENDING: "Onay Bekliyor",
    APPROVED: "ONAYLANDI",
    REJECTED: "REDDEDİLDİ",
  }[application.status];
  const embed = new EmbedBuilder()
    .setColor(COLORS[application.status])
    .setTitle(`🌍 Ülke Başvurusu — ${statusLabel}`)
    .addFields(
      { name: "Başvuran", value: `<@${application.discordUserId}>`, inline: true },
      { name: "Ülke", value: countryLabel, inline: true },
      {
        name: "Discord Kullanıcısı",
        value: `<@${application.discordUserId}>\n\`${application.discordUserId}\``,
      },
      { name: "Başvuru", value: `#${application.id}`, inline: true },
    )
    .setTimestamp(new Date(application.submittedAt));
  if (application.reviewedBy) {
    embed.addFields({ name: "İnceleyen", value: `<@${application.reviewedBy}>`, inline: true });
  }
  if (application.rejectionReason) {
    embed.addFields({ name: "Ret sebebi", value: application.rejectionReason.slice(0, 1_024) });
  }
  return embed;
}

export function buildCountryReviewButtons(applicationId: number, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_IDS.countryApprovePrefix}${applicationId}`)
      .setLabel("Onayla")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_IDS.countryRejectPrefix}${applicationId}`)
      .setLabel("Reddet")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}
