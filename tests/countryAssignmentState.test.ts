import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabase, openDatabase } from "../src/database/connection.js";
import { CountryAssignmentRepository } from "../src/database/countryAssignmentRepository.js";
import { migrate } from "../src/database/migrate.js";
import {
  maximumCountryAssignmentSnapshotLength,
  parseCountryAssignmentSnapshot,
  serializeCountryAssignmentSnapshot,
} from "../src/services/countryAssignmentStateService.js";

const guildId = "123456789012345678";
const userOne = "111111111111111111";
const userTwo = "222222222222222222";
const temporaryDirectory = mkdtempSync(join(tmpdir(), "nexavision-assignment-state-"));
const repository = new CountryAssignmentRepository();

beforeAll(() => migrate(openDatabase(join(temporaryDirectory, "test.sqlite"))));
afterAll(() => {
  closeDatabase();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("kalıcı ülke assignment snapshotı", () => {
  it("snapshotı kompakt biçimde serileştirip doğrular", () => {
    const content = serializeCountryAssignmentSnapshot(guildId, [
      { countryCode: "IT", discordUserId: userOne },
      { countryCode: "DK", discordUserId: userTwo },
    ]);
    expect(parseCountryAssignmentSnapshot(content)).toEqual({
      guildId,
      assignments: [
        { countryCode: "DK", discordUserId: userTwo },
        { countryCode: "IT", discordUserId: userOne },
      ],
    });
    expect(maximumCountryAssignmentSnapshotLength(guildId)).toBeLessThan(2_000);
  });

  it("aktif assignmentları restart snapshotından geri yükler", () => {
    expect(repository.replaceActiveSnapshot(guildId, [
      { countryCode: "IT", discordUserId: userOne },
      { countryCode: "DK", discordUserId: userTwo },
    ], "999999999999999999")).toBe(true);
    expect(repository.findActiveByCountry(guildId, "IT")?.discordUserId).toBe(userOne);
    expect(repository.findActiveByCountry(guildId, "DK")?.discordUserId).toBe(userTwo);

    expect(repository.replaceActiveSnapshot(guildId, [
      { countryCode: "DK", discordUserId: userTwo },
      { countryCode: "IT", discordUserId: userOne },
    ], "999999999999999999")).toBe(false);

    expect(repository.replaceActiveSnapshot(guildId, [
      { countryCode: "FR", discordUserId: userOne },
    ], "999999999999999999")).toBe(true);
    expect(repository.listActive(guildId)).toHaveLength(1);
    expect(repository.findActiveByCountry(guildId, "FR")?.discordUserId).toBe(userOne);
    expect(repository.findActiveByCountry(guildId, "DK")).toBeNull();
  });
});
