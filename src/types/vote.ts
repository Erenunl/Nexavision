import type { EurovisionPoint } from "../config/voting.js";

export type BallotStatus = "DRAFT" | "SUBMITTED";

export interface VoteEntry {
  targetCountryCode: string;
  points: EurovisionPoint;
}

export interface VoteBallot {
  id: number;
  guildId: string;
  voterUserId: string;
  voterCountryCode: string;
  status: BallotStatus;
  draft: VoteEntry[] | null;
  entries: VoteEntry[];
  createdAt: string;
  submittedAt: string | null;
  updatedAt: string;
}
