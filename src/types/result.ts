import type { VoteEntry } from "./vote.js";

export type ResultStatus = "PREPARED" | "RUNNING" | "PAUSED" | "FINISHED";
export interface ResultBallotSnapshot { voterCountryCode: string; entries: VoteEntry[] }
export interface ResultSession {
  id: number; guildId: string; status: ResultStatus; revealOrder: string[];
  currentIndex: number; revealMode: string; createdAt: string; startedAt: string | null; finishedAt: string | null;
  ballots: ResultBallotSnapshot[];
  targetCountries: string[];
}
