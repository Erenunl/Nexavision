import { EUROVISION_POINTS, type EurovisionPoint } from "../config/voting.js";
import type { CountryAssignmentRepository } from "../database/countryAssignmentRepository.js";
import type { SubmissionRepository } from "../database/submissionRepository.js";
import type { VoteRepository } from "../database/voteRepository.js";
import type { GuildConfigService } from "./guildConfigService.js";
import type { VoteBallot, VoteEntry } from "../types/vote.js";

export type VoteAccessResult =
  | { ok: true; countryCode: string }
  | { ok: false; message: string };

export class VotingService {
  constructor(
    private readonly configs: GuildConfigService,
    private readonly assignments: CountryAssignmentRepository,
    private readonly submissions: SubmissionRepository,
    private readonly votes: VoteRepository,
  ) {}

  checkAccess(guildId: string, userId: string, now = Math.floor(Date.now() / 1_000)): VoteAccessResult {
    const config = this.configs.get(guildId);
    if (!config.votingOpen) return { ok: false, message: "Oylama şu anda açık değil." };
    if (config.deadlines.voting && now >= config.deadlines.voting) {
      return { ok: false, message: "Oylama süresi doldu." };
    }
    const assignment = this.assignments.findActiveByUser(guildId, userId);
    if (!assignment) {
      return { ok: false, message: "Oy verebilmek için aktif bir ülke temsilcisi olmalısın." };
    }
    const eligibleCount = this.submissions
      .listApproved(guildId)
      .filter((submission) => submission.countryCode !== assignment.countryCode).length;
    if (eligibleCount < EUROVISION_POINTS.length) {
      return {
        ok: false,
        message: "Oylama için kendi ülken dışında en az 10 onaylanmış resmi şarkı bulunmalı.",
      };
    }
    return { ok: true, countryCode: assignment.countryCode };
  }

  begin(guildId: string, userId: string): VoteBallot | VoteAccessResult {
    const access = this.checkAccess(guildId, userId);
    if (!access.ok) return access;
    return this.votes.beginDraft(guildId, userId, access.countryCode);
  }

  choose(
    guildId: string,
    userId: string,
    points: EurovisionPoint,
    countryCode: string,
  ): { ok: true; ballot: VoteBallot } | { ok: false; message: string } {
    const access = this.checkAccess(guildId, userId);
    if (!access.ok) return access;
    if (!EUROVISION_POINTS.includes(points)) return { ok: false, message: "Geçersiz puan seçimi." };
    if (countryCode === access.countryCode) return { ok: false, message: "Kendi ülkene oy veremezsin." };
    if (!this.submissions.findApprovedByCountry(guildId, countryCode)) {
      return { ok: false, message: "Bu ülkenin onaylanmış resmi şarkısı yok." };
    }
    const result = this.votes.setDraftChoice(guildId, userId, points, countryCode);
    if (result === "DUPLICATE") return { ok: false, message: "Aynı ülkeyi iki farklı puana seçemezsin." };
    if (result === "NOT_FOUND") return { ok: false, message: "Oy taslağın bulunamadı; `/oyla` ile yeniden başla." };
    return { ok: true, ballot: this.votes.findByUser(guildId, userId)! };
  }

  submit(guildId: string, userId: string): { ok: true; ballot: VoteBallot; edited: boolean } | { ok: false; message: string } {
    const access = this.checkAccess(guildId, userId);
    if (!access.ok) return access;
    const ballot = this.votes.findByUser(guildId, userId);
    if (!ballot?.draft) return { ok: false, message: "Gönderilecek oy taslağı bulunamadı." };
    const validation = this.validateEntries(guildId, access.countryCode, ballot.draft);
    if (!validation.ok) return validation;
    const edited = ballot.status === "SUBMITTED";
    return { ok: true, ballot: this.votes.submitDraft(ballot, ballot.draft), edited };
  }

  validateEntries(
    guildId: string,
    voterCountryCode: string,
    entries: readonly VoteEntry[],
  ): { ok: true } | { ok: false; message: string } {
    if (entries.length !== EUROVISION_POINTS.length) {
      return { ok: false, message: "Oy pusulasında tam olarak 10 ülke bulunmalı." };
    }
    const points = new Set(entries.map((entry) => entry.points));
    if (EUROVISION_POINTS.some((point) => !points.has(point))) {
      return { ok: false, message: "Oy pusulası 12, 10, 8, 7, 6, 5, 4, 3, 2 ve 1 puanlarını içermeli." };
    }
    const countries = new Set(entries.map((entry) => entry.targetCountryCode));
    if (countries.size !== entries.length) return { ok: false, message: "Aynı ülke birden fazla kez seçilemez." };
    if (countries.has(voterCountryCode)) return { ok: false, message: "Kendi ülkene oy veremezsin." };
    for (const countryCode of countries) {
      if (!this.submissions.findApprovedByCountry(guildId, countryCode)) {
        return { ok: false, message: `${countryCode} için artık onaylanmış resmi şarkı bulunmuyor.` };
      }
    }
    return { ok: true };
  }
}
