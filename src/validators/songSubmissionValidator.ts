import type { CountryAssignmentRepository } from "../database/countryAssignmentRepository.js";
import type { SubmissionRepository } from "../database/submissionRepository.js";
import type { AssignedParticipant } from "../types/submission.js";
import type { YouTubeVideo } from "../types/youtube.js";
import { formatNumber } from "../utils/format.js";

export type ValidationResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; message: string };

export class SongSubmissionValidator {
  constructor(
    private readonly assignments: CountryAssignmentRepository,
    private readonly submissions: SubmissionRepository,
  ) {}

  validateParticipant(guildId: string, userId: string): ValidationResult<AssignedParticipant> {
    const participant = this.assignments.findActiveParticipant(guildId, userId);
    if (!participant) {
      return {
        ok: false,
        message: "Şarkı gönderebilmek için önce bir ülkenin onaylanmış temsilcisi olmalısın.",
      };
    }
    if (this.submissions.hasPendingForUser(guildId, userId)) {
      return {
        ok: false,
        message: "Zaten yönetici incelemesini bekleyen bir şarkı başvurun var.",
      };
    }
    const approved = this.submissions.findApprovedByCountry(guildId, participant.countryCode);
    if (approved?.locked) {
      return {
        ok: false,
        message: `${participant.countryFlag} ${participant.countryName}'nın resmi şarkısı zaten onaylandı ve kilitlendi.`,
      };
    }
    return { ok: true, value: participant };
  }

  validateVideo(guildId: string, video: YouTubeVideo, maxViewCount: number): ValidationResult {
    if (video.liveBroadcastContent === "live" || video.liveBroadcastContent === "upcoming") {
      return { ok: false, message: "Aktif veya planlanmış canlı yayınlar kabul edilmez." };
    }
    if (video.viewCount >= maxViewCount) {
      return {
        ok: false,
        message: `Bu video ${formatNumber(video.viewCount)} görüntülenmeye sahip. Yarışma şarkıları başvuru sırasında ${formatNumber(maxViewCount)} görüntülenmenin altında olmalıdır.`,
      };
    }
    if (this.submissions.hasApprovedVideo(guildId, video.videoId)) {
      return { ok: false, message: "Bu video daha önce yarışmada kullanılmış." };
    }
    return { ok: true, value: undefined };
  }
}
