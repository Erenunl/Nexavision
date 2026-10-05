import { describe, expect, it } from "vitest";
import { countrySetupCommand } from "../src/commands/countrySetupCommand.js";
import { settingsCommand } from "../src/commands/settingsCommand.js";
import { announcementCommand } from "../src/commands/announcementCommand.js";
import { stageMusicCommands } from "../src/commands/stageMusicCommands.js";
import { contestCommands } from "../src/commands/contestCommands.js";

describe("slash command tanımları", () => {
  it("Türkçe ülke kurulum komutunu geçerli JSON'a dönüştürür", () => {
    expect(countrySetupCommand.toJSON().name).toBe("ülkeayarla");
  });

  it("ayar komutunu korur", () => {
    expect(settingsCommand.toJSON().name).toBe("ayar");
  });

  it("duyuru komutunun zorunlu kanal ve embed seçeneklerini tanımlar", () => {
    const command = announcementCommand.toJSON();
    expect(command.name).toBe("duyuru");
    expect(command.options).toHaveLength(2);
    expect(command.options?.every((option) => option.required)).toBe(true);
  });

  it("dört Stage müzik komutunu ASCII uyumlu adlarla tanımlar", () => {
    expect(stageMusicCommands.map((command) => command.toJSON().name)).toEqual([
      "sahnebasla",
      "sahnedur",
      "sahnedevam",
      "sahnebit",
    ]);
  });

  it("yarışma hazırlık ve oy yönetimi komutlarını kaydeder", () => {
    expect(contestCommands.map((command) => command.toJSON().name)).toEqual([
      "hatirlat",
      "oylama",
      "oyla",
      "oykontrol",
      "oysifirla",
      "sarkikilidi",
      "sonuc",
      "sonucbaslat",
      "sonraki",
      "sonucdur",
      "sonucdevam",
      "sonucbitir",
      "ulke",
      "sarkidegistir",
    ]);
  });
});
