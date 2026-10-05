import { describe, expect, it } from "vitest";
import { EUROVISION_COUNTRIES, getCountry } from "../src/config/countries.js";

describe("EUROVISION_COUNTRIES", () => {
  it("50 benzersiz ülke ve rol adı içerir", () => {
    expect(EUROVISION_COUNTRIES).toHaveLength(50);
    expect(new Set(EUROVISION_COUNTRIES.map((country) => country.code)).size).toBe(50);
    expect(new Set(EUROVISION_COUNTRIES.map((country) => country.roleName)).size).toBe(50);
    for (const country of EUROVISION_COUNTRIES) {
      expect(country.roleName).toBe(`${country.flag} ${country.nameTr}`);
    }
  });

  it("Danimarka eşlemesini doğru döndürür", () => {
    expect(getCountry("DK")).toMatchObject({ nameTr: "Danimarka", flag: "🇩🇰" });
  });
});
