import { ChannelType, EmbedBuilder, type Client, type Message } from "discord.js";
import { EUROVISION_COUNTRIES } from "../config/countries.js";
import type { CountryAssignmentRepository } from "../database/countryAssignmentRepository.js";
import type { SubmissionRepository } from "../database/submissionRepository.js";
import type { VoteRepository } from "../database/voteRepository.js";
import type { GuildConfigService } from "./guildConfigService.js";

export class ContestStatusService {
  private readonly running = new Map<string, Promise<void>>();
  private readonly dirty = new Set<string>();

  constructor(
    private readonly client: Client,
    private readonly configs: GuildConfigService,
    private readonly assignments: CountryAssignmentRepository,
    private readonly submissions: SubmissionRepository,
    private readonly votes: VoteRepository,
  ) {}

  async sync(guildId: string): Promise<void> {
    this.dirty.add(guildId);
    const current = this.running.get(guildId);
    if (current) return current;
    const task = (async () => {
      while (this.dirty.delete(guildId)) await this.syncOnce(guildId);
    })().finally(() => this.running.delete(guildId));
    this.running.set(guildId, task);
    return task;
  }

  private async syncOnce(guildId: string): Promise<void> {
    const config = this.configs.get(guildId);
    if (!config.channels.contestStatus) return;
    const channel = await this.client.channels.fetch(config.channels.contestStatus);
    if (!channel || channel.type !== ChannelType.GuildText || channel.guildId !== guildId) {
      throw new Error("Yarışma durum kanalı bulunamadı veya metin kanalı değil.");
    }

    const activeAssignments = this.assignments.listActive(guildId);
    const approved = this.submissions.listApproved(guildId);
    const pendingCount = this.submissions.countByStatus(guildId, "PENDING");
    const submittedVoters = new Set(this.votes.listSubmitted(guildId).map((ballot) => ballot.voterUserId));
    const representativeCount = activeAssignments.length;
    const approvedAssignedCountries = new Set(approved.map((submission) => submission.countryCode));
    const missingSongCount = activeAssignments.filter(
      (assignment) => !approvedAssignedCountries.has(assignment.countryCode),
    ).length;
    const voteCount = activeAssignments.filter((assignment) =>
      submittedVoters.has(assignment.discordUserId),
    ).length;
    const lockedCount = approved.filter((submission) => submission.locked).length;

    const deadlineLines = [
      config.deadlines.songSubmission
        ? `Şarkı Teslimi: <t:${config.deadlines.songSubmission}:F> • <t:${config.deadlines.songSubmission}:R>`
        : "Şarkı Teslimi: Ayarlanmamış",
      config.deadlines.voting
        ? `Oylama Bitişi: <t:${config.deadlines.voting}:F> • <t:${config.deadlines.voting}:R>`
        : "Oylama Bitişi: Ayarlanmamış",
    ];
    const embed = new EmbedBuilder()
      .setColor(config.votingOpen ? 0x57f287 : 0x5865f2)
      .setTitle("Fan Song Contest — Yarışma Durumu")
      .addFields(
        {
          name: "🌍 Ülkeler",
          value: [
            `Toplam: **${EUROVISION_COUNTRIES.length}**`,
            `Temsilci: **${representativeCount} / ${EUROVISION_COUNTRIES.length}**`,
            `Temsilcisiz: **${EUROVISION_COUNTRIES.length - representativeCount}**`,
          ].join("\n"),
          inline: true,
        },
        {
          name: "🎵 Şarkılar",
          value: [
            `Resmi Şarkı: **${approved.length} / ${representativeCount}**`,
            `Şarkı Göndermeyen: **${missingSongCount}**`,
            `Admin Onayı Bekleyen: **${pendingCount}**`,
            `Kilitli: **${lockedCount}**`,
          ].join("\n"),
          inline: true,
        },
        {
          name: "🗳️ Oylama",
          value: [
            `Durum: **${config.votingOpen ? "Açık" : "Kapalı"}**`,
            `Oy Gönderen: **${voteCount} / ${representativeCount}**`,
            `Oy Vermeyen: **${representativeCount - voteCount}**`,
          ].join("\n"),
          inline: true,
        },
        { name: "⏰ Takvim", value: deadlineLines.join("\n") },
      )
      .setTimestamp();

    let message: Message | null = null;
    if (config.messages.contestStatus) {
      message = await channel.messages.fetch(config.messages.contestStatus).catch(() => null);
    }
    if (message) {
      await message.edit({ embeds: [embed] });
    } else {
      const created = await channel.send({ embeds: [embed] });
      await this.configs.setMessageId(guildId, "contestStatus", created.id);
    }
  }
}
