import { Collection, type BaseGuildTextChannel, type Message, type MessageCreateOptions } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  AnnouncementService,
  splitAnnouncementContent,
} from "../src/services/announcementService.js";

function fakeTarget(
  sent: MessageCreateOptions[],
  shouldFail?: (payload: MessageCreateOptions) => boolean,
): BaseGuildTextChannel {
  return {
    send: async (payload: MessageCreateOptions) => {
      if (shouldFail?.(payload)) throw new Error("upload failed");
      sent.push(payload);
      return { delete: async () => undefined } as unknown as Message;
    },
  } as unknown as BaseGuildTextChannel;
}

function fakeSource(
  content: string,
  attachments: Array<{ id: string; name: string; url: string; contentType: string | null }> = [],
): Message {
  return {
    content,
    attachments: new Collection(attachments.map((attachment) => [attachment.id, attachment])),
  } as unknown as Message;
}

function embedDescription(payload: MessageCreateOptions): string {
  const embed = payload.embeds?.[0];
  if (!embed) return "";
  const raw = "toJSON" in embed ? embed.toJSON() : embed;
  return raw.description ?? "";
}

describe("splitAnnouncementContent", () => {
  it("uzun içeriği kesmeden limite uygun parçalara böler", () => {
    const content = `${"a".repeat(4_095)}😀${"b".repeat(20)}`;
    const chunks = splitAnnouncementContent(content, 4_096);
    expect(chunks.every((chunk) => chunk.length <= 4_096)).toBe(true);
    expect(chunks.join("")).toBe(content);
  });
});

describe("AnnouncementService.publish", () => {
  it("normal mesajda mass mention'ı kapatır ve attachment'ı aktarır", async () => {
    const sent: MessageCreateOptions[] = [];
    const service = new AnnouncementService();
    const result = await service.publish(
      fakeSource("@everyone Merhaba <@123456789012345678> <#234567890123456789>", [
        {
          id: "1",
          name: "belge.pdf",
          url: "https://cdn.discordapp.com/belge.pdf",
          contentType: "application/pdf",
        },
      ]),
      fakeTarget(sent),
      false,
    );
    expect(result.failedAttachments).toEqual([]);
    expect(sent).toHaveLength(2);
    expect(sent[0]?.allowedMentions).toMatchObject({ parse: ["users"] });
    expect(sent[1]?.files).toHaveLength(1);
  });

  it("uzun embed içeriğini kesmeden birden fazla mesaja böler", async () => {
    const sent: MessageCreateOptions[] = [];
    const content = "x".repeat(4_200);
    await new AnnouncementService().publish(fakeSource(content), fakeTarget(sent), true);
    expect(sent).toHaveLength(2);
    expect(sent.map(embedDescription).join("")).toBe(content);
  });

  it("ilk görseli embed image yapar ve başarısız diğer dosyayı raporlar", async () => {
    const sent: MessageCreateOptions[] = [];
    const service = new AnnouncementService();
    const result = await service.publish(
      fakeSource("Duyuru", [
        {
          id: "1",
          name: "görsel.png",
          url: "https://cdn.discordapp.com/gorsel.png",
          contentType: "image/png",
        },
        {
          id: "2",
          name: "bozuk.pdf",
          url: "https://cdn.discordapp.com/bozuk.pdf",
          contentType: "application/pdf",
        },
      ]),
      fakeTarget(sent, (payload) =>
        Boolean(payload.files?.some((file) => typeof file !== "string" && "name" in file && file.name?.includes("bozuk"))),
      ),
      true,
    );
    expect(sent[0]?.files).toHaveLength(1);
    expect(result.failedAttachments).toEqual(["bozuk.pdf"]);
  });
});

describe("AnnouncementService.findLatestEligibleMessage", () => {
  it("bot, webhook, system ve boş mesajları atlayıp son kullanıcı mesajını seçer", async () => {
    const eligible = {
      id: "1",
      createdTimestamp: 100,
      author: { bot: false },
      webhookId: null,
      system: false,
      content: "Duyurulacak mesaj",
      attachments: new Collection(),
    } as unknown as Message;
    const messages = new Collection<string, Message>([
      [
        "5",
        {
          id: "5",
          createdTimestamp: 104,
          author: { bot: true },
          webhookId: null,
          system: false,
          content: "Bot",
          attachments: new Collection(),
        } as unknown as Message,
      ],
      [
        "4",
        {
          id: "4",
          createdTimestamp: 103,
          author: { bot: false },
          webhookId: "webhook",
          system: false,
          content: "Webhook",
          attachments: new Collection(),
        } as unknown as Message,
      ],
      [
        "3",
        {
          id: "3",
          createdTimestamp: 102,
          author: { bot: false },
          webhookId: null,
          system: true,
          content: "System",
          attachments: new Collection(),
        } as unknown as Message,
      ],
      [
        "2",
        {
          id: "2",
          createdTimestamp: 101,
          author: { bot: false },
          webhookId: null,
          system: false,
          content: "   ",
          attachments: new Collection(),
        } as unknown as Message,
      ],
      ["1", eligible],
    ]);
    const channel = {
      messages: { fetch: async () => messages },
    } as unknown as BaseGuildTextChannel;
    await expect(new AnnouncementService().findLatestEligibleMessage(channel, 200)).resolves.toBe(eligible);
  });
});
