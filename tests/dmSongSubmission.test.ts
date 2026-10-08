import { describe, expect, it } from "vitest";
import { findDmSubmissionGuilds } from "../src/events/messageCreate/songSubmissionHandler.js";
import type { CountryAssignmentRepository } from "../src/database/countryAssignmentRepository.js";

describe("DM şarkı başvurusu sunucu çözümleme", () => {
  it("kullanıcının aktif temsilciliği bulunan tek sunucuyu seçer", () => {
    const assignments = {
      findActiveByUser: (guildId: string, userId: string) =>
        guildId === "222222222222222222" && userId === "999999999999999999"
          ? { guildId, discordUserId: userId, countryCode: "DK" }
          : null,
    } as unknown as Pick<CountryAssignmentRepository, "findActiveByUser">;

    expect(
      findDmSubmissionGuilds(
        ["111111111111111111", "222222222222222222"],
        "999999999999999999",
        assignments,
      ),
    ).toEqual(["222222222222222222"]);
  });

  it("birden fazla aktif temsilciliği belirsizlik olarak döndürür", () => {
    const assignments = {
      findActiveByUser: (guildId: string, userId: string) => ({ guildId, discordUserId: userId, countryCode: "DK" }),
    } as unknown as Pick<CountryAssignmentRepository, "findActiveByUser">;

    expect(
      findDmSubmissionGuilds(
        ["111111111111111111", "222222222222222222"],
        "999999999999999999",
        assignments,
      ),
    ).toHaveLength(2);
  });
});
