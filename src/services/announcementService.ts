import {
  EmbedBuilder,
  type BaseGuildTextChannel,
  type Message,
  type MessageCreateOptions,
} from "discord.js";

const EMBED_DESCRIPTION_LIMIT = 4_096;
const MESSAGE_CONTENT_LIMIT = 2_000;
const SOURCE_SCAN_PAGE_LIMIT = 5;

export interface AnnouncementResult {
  sentMessageCount: number;
  failedAttachments: string[];
}

interface PreparedAttachment {
  originalName: string;
  name: string;
  url: string;
  image: boolean;
}

export function splitAnnouncementContent(content: string, limit: number): string[] {
  if (!content) return [];
  const chunks: string[] = [];
  let remaining = content;
  while (remaining.length > limit) {
    let cut = limit;
    const newlineBreak = remaining.lastIndexOf("\n", limit - 1);
    const spaceBreak = remaining.lastIndexOf(" ", limit - 1);
    const naturalBreak = Math.max(newlineBreak, spaceBreak);
    if (naturalBreak >= Math.floor(limit / 2)) cut = naturalBreak + 1;
    const previousCode = remaining.charCodeAt(cut - 1);
    const nextCode = remaining.charCodeAt(cut);
    if (previousCode >= 0xd800 && previousCode <= 0xdbff && nextCode >= 0xdc00 && nextCode <= 0xdfff) {
      cut -= 1;
    }
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function safeAttachmentName(original: string, index: number): string {
  const cleaned = original.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(-120) || `dosya-${index + 1}`;
  return `duyuru-${index + 1}-${cleaned}`;
}

function isImageAttachment(contentType: string | null, filename: string): boolean {
  return Boolean(contentType?.startsWith("image/") || /\.(?:png|jpe?g|gif|webp)$/iu.test(filename));
}

function neutralEmbed(description?: string): EmbedBuilder {
  const embed = new EmbedBuilder().setTimestamp();
  if (description) embed.setDescription(description);
  return embed;
}

export class AnnouncementService {
  private readonly allowMassMentions: boolean;

  constructor(options: { allowMassMentions?: boolean } = {}) {
    this.allowMassMentions = options.allowMassMentions ?? false;
  }

  async findLatestEligibleMessage(
    channel: BaseGuildTextChannel,
    beforeTimestamp: number,
  ): Promise<Message | null> {
    let before: string | undefined;
    for (let page = 0; page < SOURCE_SCAN_PAGE_LIMIT; page += 1) {
      const messages = await channel.messages.fetch({ limit: 100, before });
      for (const message of messages.values()) {
        if (message.createdTimestamp > beforeTimestamp) continue;
        if (message.author.bot || message.webhookId || message.system) continue;
        if (!message.content.trim() && message.attachments.size === 0) continue;
        return message;
      }
      if (messages.size < 100) break;
      before = messages.last()?.id;
    }
    return null;
  }

  async publish(
    source: Message,
    target: BaseGuildTextChannel,
    asEmbed: boolean,
  ): Promise<AnnouncementResult> {
    const attachments: PreparedAttachment[] = [...source.attachments.values()].map((attachment, index) => ({
      originalName: attachment.name,
      name: safeAttachmentName(attachment.name, index),
      url: attachment.url,
      image: isImageAttachment(attachment.contentType, attachment.name),
    }));
    const failedAttachments: string[] = [];
    let sentMessageCount = 0;
    const coreMessages: Message[] = [];

    if (asEmbed) {
      const chunks = splitAnnouncementContent(source.content, EMBED_DESCRIPTION_LIMIT);
      const firstImage = attachments.find((attachment) => attachment.image) ?? null;
      const embedChunks = chunks.length > 0 ? chunks : firstImage ? [""] : [];

      for (let index = 0; index < embedChunks.length; index += 1) {
        const description = embedChunks[index];
        const isFirst = index === 0;
        const embed = neutralEmbed(description || undefined);
        let payload: MessageCreateOptions = {
          embeds: [embed],
          allowedMentions: this.allowedMentions(),
        };

        if (isFirst && firstImage) {
          embed.setImage(`attachment://${firstImage.name}`);
          payload = {
            ...payload,
            embeds: [embed],
            files: [{ attachment: firstImage.url, name: firstImage.name }],
          };
        }

        try {
          coreMessages.push(await target.send(payload));
          sentMessageCount += 1;
        } catch (error) {
          if (!isFirst || !firstImage) {
            await this.cleanupMessages(coreMessages);
            throw error;
          }
          failedAttachments.push(firstImage.originalName);
          if (description) {
            try {
              coreMessages.push(
                await target.send({
                  embeds: [neutralEmbed(description)],
                  allowedMentions: this.allowedMentions(),
                }),
              );
              sentMessageCount += 1;
            } catch (fallbackError) {
              await this.cleanupMessages(coreMessages);
              throw fallbackError;
            }
          }
        }
      }

      for (const attachment of attachments) {
        if (attachment === firstImage) continue;
        try {
          await this.sendAttachment(target, attachment);
          sentMessageCount += 1;
        } catch {
          failedAttachments.push(attachment.originalName);
        }
      }
    } else {
      for (const chunk of splitAnnouncementContent(source.content, MESSAGE_CONTENT_LIMIT)) {
        try {
          coreMessages.push(
            await target.send({ content: chunk, allowedMentions: this.allowedMentions() }),
          );
          sentMessageCount += 1;
        } catch (error) {
          await this.cleanupMessages(coreMessages);
          throw error;
        }
      }
      for (const attachment of attachments) {
        try {
          await this.sendAttachment(target, attachment);
          sentMessageCount += 1;
        } catch {
          failedAttachments.push(attachment.originalName);
        }
      }
    }

    if (sentMessageCount === 0) {
      throw new Error(
        failedAttachments.length > 0
          ? `Hiçbir attachment aktarılamadı: ${failedAttachments.join(", ")}`
          : "Duyuru içeriği gönderilemedi.",
      );
    }
    return { sentMessageCount, failedAttachments };
  }

  private allowedMentions(): NonNullable<MessageCreateOptions["allowedMentions"]> {
    return this.allowMassMentions
      ? { parse: ["users", "roles", "everyone"], repliedUser: false }
      : { parse: ["users"], repliedUser: false };
  }

  private async sendAttachment(target: BaseGuildTextChannel, attachment: PreparedAttachment): Promise<void> {
    await target.send({
      files: [{ attachment: attachment.url, name: attachment.name }],
      allowedMentions: this.allowedMentions(),
    });
  }

  private async cleanupMessages(messages: Message[]): Promise<void> {
    await Promise.allSettled(messages.map((message) => message.delete()));
  }
}
