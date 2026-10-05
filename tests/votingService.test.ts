import { describe, expect, it } from "vitest";
import type { CountryAssignmentRepository } from "../src/database/countryAssignmentRepository.js";
import type { SubmissionRepository } from "../src/database/submissionRepository.js";
import type { VoteRepository } from "../src/database/voteRepository.js";
import type { GuildConfigService } from "../src/services/guildConfigService.js";
import { VotingService } from "../src/services/votingService.js";
import { EUROVISION_POINTS } from "../src/config/voting.js";

const approved = new Set(["SE", "FI", "FR", "IT", "ES", "NO", "NL", "BE", "PL", "TR"]);
const submissions = {
  findApprovedByCountry: (_guildId: string, countryCode: string) =>
    approved.has(countryCode) ? { countryCode } : null,
} as unknown as SubmissionRepository;
const service = new VotingService(
  {} as GuildConfigService,
  {} as CountryAssignmentRepository,
  submissions,
  {} as VoteRepository,
);
const validEntries = EUROVISION_POINTS.map((points, index) => ({
  points,
  targetCountryCode: [...approved][index]!,
}));

describe("VotingService server-side ballot doğrulaması", () => {
  it("tam ve unique Eurovision puan setini kabul eder", () => {
    expect(service.validateEntries("guild", "DK", validEntries)).toEqual({ ok: true });
  });

  it("self vote, duplicate ülke ve resmi şarkısı olmayan hedefi reddeder", () => {
    expect(service.validateEntries("guild", "SE", validEntries).ok).toBe(false);
    expect(
      service.validateEntries("guild", "DK", [
        ...validEntries.slice(0, 9),
        { points: 1, targetCountryCode: "SE" },
      ]).ok,
    ).toBe(false);
    expect(
      service.validateEntries("guild", "DK", [
        ...validEntries.slice(0, 9),
        { points: 1, targetCountryCode: "XX" },
      ]).ok,
    ).toBe(false);
  });
});
