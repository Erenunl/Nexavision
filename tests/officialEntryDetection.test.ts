import { describe, expect, it } from "vitest";
import { isOfficialEntryEmbedTitle } from "../src/events/interactionCreate/contestAdminInteractions.js";

describe("resmi şarkı kanal mesajı tespiti", () => {
  it("güncel resmi şarkı embed başlığını tanır", () => {
    expect(isOfficialEntryEmbedTitle("🇲🇩 MOLDOVA’NİN RESMİ ŞARKISI SEÇİLDİ!")).toBe(true);
  });

  it("düz apostrof kullanılan eski başlığı da tanır", () => {
    expect(isOfficialEntryEmbedTitle("🇬🇧 BİRLEŞİK KRALLIK'NİN RESMİ ŞARKISI SEÇİLDİ!")).toBe(true);
  });

  it("başka bot embedlerini resmi şarkı olarak işaretlemez", () => {
    expect(isOfficialEntryEmbedTitle("🏆 FAN SONG CONTEST KAZANANI")).toBe(false);
    expect(isOfficialEntryEmbedTitle(null)).toBe(false);
  });
});
