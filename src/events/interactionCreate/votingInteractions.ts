import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type Interaction,
} from "discord.js";
import { getCountry } from "../../config/countries.js";
import { CUSTOM_IDS } from "../../config/constants.js";
import { EUROVISION_POINTS, type EurovisionPoint } from "../../config/voting.js";
import type { SubmissionRepository } from "../../database/submissionRepository.js";
import type { VoteRepository } from "../../database/voteRepository.js";
import type { ContestStatusService } from "../../services/contestStatusService.js";
import type { LogService } from "../../services/logService.js";
import type { VotingService } from "../../services/votingService.js";
import type { VoteBallot, VoteEntry } from "../../types/vote.js";

interface Dependencies {
  voting: VotingService;
  votes: VoteRepository;
  submissions: SubmissionRepository;
  status: ContestStatusService;
  logs: LogService;
}

function entryLines(entries: readonly VoteEntry[]): string {
  return [...entries]
    .sort((a, b) => b.points - a.points)
    .map((entry) => {
      const country = getCountry(entry.targetCountryCode);
      return `**${entry.points}** — ${country?.flag ?? "🌍"} ${country?.nameTr ?? entry.targetCountryCode}`;
    })
    .join("\n");
}

function ballotEmbed(ballot: VoteBallot, entries: readonly VoteEntry[], title: string): EmbedBuilder {
  const own = getCountry(ballot.voterCountryCode);
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(title)
    .setDescription(entries.length ? entryLines(entries) : "Henüz seçim yapılmadı.")
    .setFooter({ text: `${own?.flag ?? "🌍"} ${own?.nameTr ?? ballot.voterCountryCode} adına oy kullanıyorsun.` });
}

function closeButton(label = "İptal"): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(CUSTOM_IDS.voteCancel).setLabel(label).setStyle(ButtonStyle.Secondary),
  );
}

function renderSubmitted(ballot: VoteBallot) {
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(CUSTOM_IDS.voteEdit).setLabel("Oylarımı Düzenle").setEmoji("✏️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.voteCancel).setLabel("Kapat").setStyle(ButtonStyle.Secondary),
  );
  return {
    content: "Mevcut oyların aşağıda. Deadline geçmeden ve oylama açıkken düzenleyebilirsin.",
    embeds: [ballotEmbed(ballot, ballot.entries, "Mevcut Oylarım")],
    components: [buttons],
  };
}

function renderDraft(ballot: VoteBallot, submissions: SubmissionRepository) {
  const draft = ballot.draft ?? [];
  const missingPoint = EUROVISION_POINTS.find((point) => !draft.some((entry) => entry.points === point));
  if (!missingPoint) {
    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(CUSTOM_IDS.voteSubmit).setLabel("Oyları Gönder").setEmoji("✅").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(CUSTOM_IDS.voteEdit).setLabel("Baştan Düzenle").setEmoji("✏️").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(CUSTOM_IDS.voteCancel).setLabel("İptal").setEmoji("❌").setStyle(ButtonStyle.Secondary),
    );
    return {
      content: "**Oylarını Onayla** — Göndermeden önce tüm seçimlerini kontrol et.",
      embeds: [ballotEmbed(ballot, draft, "Oy Pusulası Onayı")],
      components: [buttons],
    };
  }

  const used = new Set(draft.map((entry) => entry.targetCountryCode));
  const candidates = submissions
    .listApproved(ballot.guildId)
    .filter((submission) => submission.countryCode !== ballot.voterCountryCode && !used.has(submission.countryCode));
  const rows: Array<ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>> = [];
  for (let offset = 0; offset < candidates.length; offset += 25) {
    const chunk = candidates.slice(offset, offset + 25);
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`${CUSTOM_IDS.voteSelectPrefix}${missingPoint}:${offset / 25}`)
      .setPlaceholder(`${missingPoint} puan verilecek ülkeyi seç`)
      .addOptions(
        chunk.map((submission) => {
          const country = getCountry(submission.countryCode);
          return new StringSelectMenuOptionBuilder()
            .setLabel(`${country?.nameTr ?? submission.countryName}`.slice(0, 100))
            .setValue(submission.countryCode)
            .setEmoji(country?.flag ?? submission.countryFlag)
            .setDescription(submission.songTitle.slice(0, 100));
        }),
      );
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  }
  rows.push(closeButton());
  return {
    content: `Sıradaki seçim: **${missingPoint} puan**. Aynı ülke yalnızca bir kez seçilebilir.`,
    embeds: [ballotEmbed(ballot, draft, `Oy Pusulası — ${draft.length}/10`)],
    components: rows,
  };
}

export async function handleVotingInteraction(
  interaction: Interaction,
  dependencies: Dependencies,
): Promise<boolean> {
  const customId = "customId" in interaction ? interaction.customId : "";
  const relevant =
    (interaction.isChatInputCommand() && interaction.commandName === "oyla") ||
    customId.startsWith("vote:") && !customId.startsWith("vote:reset");
  if (!relevant) return false;
  if (!interaction.inCachedGuild()) return true;

  if (interaction.isChatInputCommand()) {
    const access = dependencies.voting.checkAccess(interaction.guildId, interaction.user.id);
    if (!access.ok) {
      await interaction.reply({ content: access.message, flags: MessageFlags.Ephemeral });
      return true;
    }
    const existing = dependencies.votes.findByUser(interaction.guildId, interaction.user.id);
    if (existing?.status === "SUBMITTED" && existing.draft === null) {
      await interaction.reply({ ...renderSubmitted(existing), flags: MessageFlags.Ephemeral });
      return true;
    }
    const ballot = dependencies.voting.begin(interaction.guildId, interaction.user.id);
    if ("ok" in ballot && !ballot.ok) {
      await interaction.reply({ content: ballot.message, flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.reply({
      ...renderDraft(ballot as VoteBallot, dependencies.submissions),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (interaction.isStringSelectMenu() && customId.startsWith(CUSTOM_IDS.voteSelectPrefix)) {
    const rawPoint = Number(customId.slice(CUSTOM_IDS.voteSelectPrefix.length).split(":")[0]);
    if (!EUROVISION_POINTS.includes(rawPoint as EurovisionPoint)) {
      await interaction.reply({ content: "Geçersiz puan adımı.", flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferUpdate();
    const result = dependencies.voting.choose(
      interaction.guildId,
      interaction.user.id,
      rawPoint as EurovisionPoint,
      interaction.values[0] ?? "",
    );
    if (!result.ok) {
      await interaction.followUp({ content: result.message, flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.editReply(renderDraft(result.ballot, dependencies.submissions));
    return true;
  }

  if (interaction.isButton() && customId === CUSTOM_IDS.voteEdit) {
    const access = dependencies.voting.checkAccess(interaction.guildId, interaction.user.id);
    if (!access.ok) {
      await interaction.reply({ content: access.message, flags: MessageFlags.Ephemeral });
      return true;
    }
    const current = dependencies.votes.findByUser(interaction.guildId, interaction.user.id);
    const editable = current
      ? dependencies.votes.restartDraft(interaction.guildId, interaction.user.id, access.countryCode)
      : dependencies.votes.beginDraft(interaction.guildId, interaction.user.id, access.countryCode);
    if (!editable) return true;
    await interaction.update(renderDraft(editable, dependencies.submissions));
    return true;
  }

  if (interaction.isButton() && customId === CUSTOM_IDS.voteSubmit) {
    await interaction.deferUpdate();
    const result = dependencies.voting.submit(interaction.guildId, interaction.user.id);
    if (!result.ok) {
      await interaction.followUp({ content: result.message, flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.editReply({
      content: result.edited ? "✅ Oyların güvenli şekilde güncellendi." : "✅ Oyların gönderildi.",
      embeds: [ballotEmbed(result.ballot, result.ballot.entries, "Gönderilen Oylar")],
      components: [],
    });
    await dependencies.status.sync(interaction.guildId).catch((error) =>
      dependencies.logs.error(interaction.guildId, "Oy gönderimi sonrası durum paneli güncellenemedi.", error),
    );
    return true;
  }

  if (interaction.isButton() && customId === CUSTOM_IDS.voteCancel) {
    dependencies.votes.cancelDraft(interaction.guildId, interaction.user.id);
    await interaction.update({ content: "Oy işlemi kapatıldı.", embeds: [], components: [] });
    return true;
  }
  return true;
}
