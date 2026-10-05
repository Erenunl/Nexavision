import type { Client } from "discord.js";
import { getCountry } from "../config/countries.js";
import type { CountryAssignmentRepository } from "../database/countryAssignmentRepository.js";
import type { ReminderRepository, DeadlineType } from "../database/reminderRepository.js";
import type { SubmissionRepository } from "../database/submissionRepository.js";
import type { VoteRepository } from "../database/voteRepository.js";
import type { GuildConfigService } from "./guildConfigService.js";
import type { LogService } from "./logService.js";

export interface ReminderSummary {
  checked: number;
  sent: number;
  failed: number;
}

const THRESHOLDS = [24, 6, 1] as const;

export class ReminderService {
  private timer: NodeJS.Timeout | null = null;
  private checking = false;

  constructor(
    private readonly client: Client,
    private readonly configs: GuildConfigService,
    private readonly assignments: CountryAssignmentRepository,
    private readonly submissions: SubmissionRepository,
    private readonly votes: VoteRepository,
    private readonly reminders: ReminderRepository,
    private readonly logs: LogService,
  ) {}

  start(): void {
    if (this.timer) return;
    void this.checkNow().catch((error) => this.logs.debug("Deadline reminder kontrolü başarısız.", error));
    this.timer = setInterval(
      () => void this.checkNow().catch((error) => this.logs.debug("Deadline reminder kontrolü başarısız.", error)),
      60_000,
    );
    this.timer.unref();
  }

  async checkNow(now = Math.floor(Date.now() / 1_000)): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      for (const guild of this.client.guilds.cache.values()) {
        for (const type of ["songSubmission", "voting"] as const) {
          await this.processDeadline(guild.id, type, now);
        }
      }
    } finally {
      this.checking = false;
    }
  }

  async sendManual(guildId: string, type: DeadlineType): Promise<ReminderSummary> {
    return this.sendToEligible(guildId, type, null);
  }

  private async processDeadline(guildId: string, type: DeadlineType, now: number): Promise<void> {
    const deadline = this.configs.get(guildId).deadlines[type];
    if (!deadline) return;
    const remainingHours = (deadline - now) / 3_600;
    const due = THRESHOLDS.filter(
      (threshold) => remainingHours <= threshold && !this.reminders.isProcessed(guildId, type, deadline, threshold),
    );
    if (due.length === 0) return;

    if (remainingHours <= 0) {
      for (const threshold of due) this.reminders.claim(guildId, type, deadline, threshold);
      return;
    }

    const selected = Math.min(...due);
    for (const threshold of due) {
      if (threshold !== selected) this.reminders.claim(guildId, type, deadline, threshold);
    }
    if (!this.reminders.claim(guildId, type, deadline, selected)) return;
    const summary = await this.sendToEligible(guildId, type, selected);
    this.reminders.finish(guildId, type, deadline, selected, summary.sent, summary.failed);
    await this.logs.info(
      guildId,
      `${type === "songSubmission" ? "Şarkı" : "Oylama"} deadline hatırlatması (${selected} saat): ${summary.sent} gönderildi, ${summary.failed} başarısız.`,
    );
  }

  private async sendToEligible(
    guildId: string,
    type: DeadlineType,
    hours: number | null,
  ): Promise<ReminderSummary> {
    const assignments = this.assignments.listActive(guildId);
    const eligible = assignments.filter((assignment) =>
      type === "songSubmission"
        ? !this.submissions.findApprovedByCountry(guildId, assignment.countryCode)
        : !this.votes.hasSubmitted(guildId, assignment.discordUserId),
    );
    const summary: ReminderSummary = { checked: assignments.length, sent: 0, failed: 0 };
    for (const assignment of eligible) {
      const country = getCountry(assignment.countryCode);
      const timeText = hours === null ? "Lütfen en kısa sürede işlemini tamamla." : `Sürenin bitmesine ${hours} saat kaldı.`;
      const content =
        type === "songSubmission"
          ? `${country?.flag ?? "🌍"} ${country?.nameTr ?? assignment.countryCode} için henüz resmi bir şarkın bulunmuyor. ${timeText}`
          : `Oylarını henüz tamamlamadın. ${timeText}`;
      try {
        const user = await this.client.users.fetch(assignment.discordUserId);
        await user.send(content);
        summary.sent += 1;
      } catch (error) {
        summary.failed += 1;
        this.logs.debug(`${guildId}/${assignment.discordUserId} reminder DM gönderilemedi.`, error);
      }
    }
    return summary;
  }
}
