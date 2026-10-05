import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { closeDatabase, openDatabase } from "../src/database/connection.js";
import { CountryApplicationRepository } from "../src/database/countryApplicationRepository.js";
import { CountryAssignmentRepository } from "../src/database/countryAssignmentRepository.js";
import { migrate } from "../src/database/migrate.js";

const guildId = "123456789012345678";
const userOne = "111111111111111111";
const userTwo = "222222222222222222";
const userThree = "333333333333333333";
const tempDirectory = mkdtempSync(join(tmpdir(), "nexavision-country-test-"));
const applications = new CountryApplicationRepository();
const assignments = new CountryAssignmentRepository();
let danishApplicationId: number;

beforeAll(() => migrate(openDatabase(join(tempDirectory, "test.sqlite"))));
afterAll(() => {
  closeDatabase();
  rmSync(tempDirectory, { recursive: true, force: true });
});

describe("ülke başvurusu ve assignment atomikliği", () => {
  it("aynı kullanıcı ve ülke için ikinci pending başvuruları engeller", () => {
    const first = applications.createPending(guildId, userOne, "DK");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    danishApplicationId = first.application.id;
    expect(applications.createPending(guildId, userTwo, "DK")).toMatchObject({
      ok: false,
      reason: "country_pending",
    });
    expect(applications.createPending(guildId, userOne, "TR")).toMatchObject({
      ok: false,
      reason: "user_pending",
    });
  });

  it("onayı assignment ile aynı transaction içinde tamamlar", () => {
    const pending = applications.findById(danishApplicationId)!;
    const result = applications.approveAndAssign(pending.id, "999999999999999999");
    expect(result.ok).toBe(true);
    expect(applications.findById(pending.id)?.status).toBe("APPROVED");
    expect(assignments.findActiveByUser(guildId, userOne)?.countryCode).toBe("DK");
    expect(assignments.findActiveParticipant(guildId, userOne)).toMatchObject({
      countryCode: "DK",
      countryName: "Danimarka",
      countryFlag: "🇩🇰",
    });
  });

  it("dolu ülke ve atanmış kullanıcı için yeni başvuruyu engeller", () => {
    expect(applications.createPending(guildId, userTwo, "DK")).toMatchObject({
      ok: false,
      reason: "country_taken",
    });
    expect(applications.createPending(guildId, userOne, "TR")).toMatchObject({
      ok: false,
      reason: "already_assigned",
      countryCode: "DK",
    });
  });

  it("reddedilen pending başvurunun kullanıcıyı ve ülkeyi serbest bıraktığını doğrular", () => {
    const first = applications.createPending(guildId, userTwo, "TR");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(applications.rejectIfPending(first.application.id, "999999999999999999", "Test")).toBe(true);
    expect(applications.createPending(guildId, userThree, "TR").ok).toBe(true);
    expect(applications.createPending(guildId, userTwo, "PL").ok).toBe(true);
  });
});
