import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { closeDatabase, openDatabase } from "../src/database/connection.js";
import { migrate } from "../src/database/migrate.js";
import { VoteRepository } from "../src/database/voteRepository.js";
import { ReminderRepository } from "../src/database/reminderRepository.js";
import { EUROVISION_POINTS } from "../src/config/voting.js";

const directory = mkdtempSync(join(tmpdir(), "nexavision-vote-test-"));
const guildId = "123456789012345678";
const userId = "111111111111111111";
const countries = ["SE", "FI", "FR", "IT", "ES", "NO", "NL", "BE", "PL", "TR"];
const votes = new VoteRepository();
const reminders = new ReminderRepository();

beforeAll(() => migrate(openDatabase(join(directory, "test.sqlite"))));
afterAll(() => {
  closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

describe("VoteRepository", () => {
  it("persistent draft üzerinde duplicate ülkeyi reddeder ve tam ballot submit eder", () => {
    votes.beginDraft(guildId, userId, "DK");
    expect(votes.setDraftChoice(guildId, userId, 12, "SE")).toBe("UPDATED");
    expect(votes.setDraftChoice(guildId, userId, 10, "SE")).toBe("DUPLICATE");
    EUROVISION_POINTS.slice(1).forEach((point, index) => {
      expect(votes.setDraftChoice(guildId, userId, point, countries[index + 1]!)).toBe("UPDATED");
    });
    const draft = votes.findByUser(guildId, userId)!;
    expect(draft.draft).toHaveLength(10);
    votes.submitDraft(draft, draft.draft!);
    expect(new VoteRepository().findByUser(guildId, userId)).toMatchObject({
      status: "SUBMITTED",
      draft: null,
    });
    expect(votes.listSubmitted(guildId)[0]?.entries).toHaveLength(10);
  });

  it("aynı deadline reminder claim'ini yalnızca bir kere kabul eder", () => {
    expect(reminders.claim(guildId, "voting", 1_999_999_999, 6)).toBe(true);
    expect(reminders.claim(guildId, "voting", 1_999_999_999, 6)).toBe(false);
    expect(reminders.isProcessed(guildId, "voting", 1_999_999_999, 6)).toBe(true);
  });
});
