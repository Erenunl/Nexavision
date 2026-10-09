import { describe, expect, it } from "vitest";
import { selectDmInboxDestinations } from "../src/services/dmInboxService.js";

const first = { guildId: "111111111111111111", channelId: "333333333333333333" };
const second = { guildId: "222222222222222222", channelId: "444444444444444444" };

describe("DM gelen kutusu hedef seçimi", () => {
  it("tek ayarlı sunucuda tüm DM'leri o kanala yönlendirir", () => {
    expect(selectDmInboxDestinations([first], new Set())).toEqual([first]);
  });

  it("birden fazla ayarlı sunucuda yalnızca gönderenin üye olduğu sunucuları seçer", () => {
    expect(selectDmInboxDestinations([first, second], new Set([second.guildId]))).toEqual([second]);
  });

  it("ayarlı kanal yoksa hedef üretmez", () => {
    expect(selectDmInboxDestinations([], new Set())).toEqual([]);
  });
});
