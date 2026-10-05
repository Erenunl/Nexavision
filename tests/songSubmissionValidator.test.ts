import { describe, expect, it } from "vitest";
import type { CountryAssignmentRepository } from "../src/database/countryAssignmentRepository.js";
import type { SubmissionRepository } from "../src/database/submissionRepository.js";
import type { YouTubeVideo } from "../src/types/youtube.js";
import { SongSubmissionValidator } from "../src/validators/songSubmissionValidator.js";

const assignments = { findActiveParticipant: () => null } as unknown as CountryAssignmentRepository;
const submissions = {
  hasPendingForUser: () => false,
  hasApprovedCountry: () => false,
  hasApprovedVideo: () => false,
} as unknown as SubmissionRepository;
const validator = new SongSubmissionValidator(assignments, submissions);

const video = (viewCount: number, liveBroadcastContent = "none"): YouTubeVideo => ({
  videoId: "aaaaaaaaaaa",
  canonicalUrl: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
  title: "Song",
  channelTitle: "Artist",
  thumbnailUrl: null,
  viewCount,
  duration: "PT3M",
  publishedAt: "2025-01-01T00:00:00Z",
  liveBroadcastContent,
});

describe("SongSubmissionValidator video kuralları", () => {
  it("limitin bir altındaki görüntülenmeyi kabul eder", () => {
    expect(validator.validateVideo("guild", video(299_999), 300_000).ok).toBe(true);
  });

  it("tam limite ulaşan görüntülenmeyi reddeder", () => {
    expect(validator.validateVideo("guild", video(300_000), 300_000).ok).toBe(false);
  });

  it("aktif ve planlanmış canlı yayınları reddeder", () => {
    expect(validator.validateVideo("guild", video(1, "live"), 300_000).ok).toBe(false);
    expect(validator.validateVideo("guild", video(1, "upcoming"), 300_000).ok).toBe(false);
  });
});
