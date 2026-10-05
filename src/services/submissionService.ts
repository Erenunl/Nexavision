import type { AssignedParticipant } from "../types/submission.js";
import type { YouTubeVideo } from "../types/youtube.js";
import type { SubmissionRepository } from "../database/submissionRepository.js";
import type { SongSubmissionValidator } from "../validators/songSubmissionValidator.js";

export class SubmissionService {
  constructor(
    private readonly submissions: SubmissionRepository,
    private readonly validator: SongSubmissionValidator,
  ) {}

  validateParticipant(guildId: string, userId: string) {
    return this.validator.validateParticipant(guildId, userId);
  }

  validateVideo(guildId: string, video: YouTubeVideo, maxViewCount: number) {
    return this.validator.validateVideo(guildId, video, maxViewCount);
  }

  createPending(guildId: string, participant: AssignedParticipant, video: YouTubeVideo) {
    return this.submissions.createPending(guildId, participant, video);
  }

  markDispatchFailed(id: number): void {
    this.submissions.rejectSystemFailure(id, "Admin onay mesajı gönderilemedi.");
  }
}
