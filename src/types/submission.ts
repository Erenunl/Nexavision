export type SubmissionStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface AssignedParticipant {
  guildId: string;
  discordUserId: string;
  countryCode: string;
  countryName: string;
  countryFlag: string;
}

export interface SongSubmission {
  id: number;
  guildId: string;
  discordUserId: string;
  countryCode: string;
  countryName: string;
  countryFlag: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  songTitle: string;
  youtubeChannelName: string;
  thumbnailUrl: string | null;
  viewCountAtSubmission: number;
  viewCountAtApproval: number | null;
  duration: string;
  publishedAt: string;
  status: SubmissionStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  adminChannelId: string | null;
  adminMessageId: string | null;
  locked: boolean;
  replacesSubmissionId: number | null;
}
