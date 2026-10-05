import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  type BaseGuildTextChannel,
  type Interaction,
} from "discord.js";
import type { AnnouncementService } from "../../services/announcementService.js";
import type { AuthorizationService } from "../../services/authorizationService.js";
import type { LogService } from "../../services/logService.js";

const activeAnnouncements = new Set<string>();
const recentAnnouncements = new Map<string, number>();
const DUPLICATE_WINDOW_MS = 10_000;

function escapeInlineCode(value: string): string {
  return value.replace(/`/g, "ˋ").slice(0, 150);
}

export async function handleAnnouncementInteraction(
  interaction: Interaction,
  dependencies: {
    authorization: AuthorizationService;
    announcements: AnnouncementService;
    logs: LogService;
  },
): Promise<boolean> {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "duyuru") return false;
  if (!interaction.inCachedGuild()) return true;

  const member = interaction.member;
  if (!dependencies.authorization.canManageSettings(interaction.guild, member)) {
    await interaction.reply({
      content: "Bu komutu kullanma yetkiniz bulunmuyor.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const source = interaction.channel;
  if (!source || (source.type !== ChannelType.GuildText && source.type !== ChannelType.GuildAnnouncement)) {
    await interaction.reply({
      content: "Kaynak kanal mesaj geçmişi okunabilen bir Discord metin kanalı olmalıdır.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const targetOption = interaction.options.getChannel("kanal", true);
  const asEmbed = interaction.options.getBoolean("embed", true);
  if (
    (targetOption.type !== ChannelType.GuildText && targetOption.type !== ChannelType.GuildAnnouncement) ||
    !("guildId" in targetOption) ||
    targetOption.guildId !== interaction.guildId ||
    !targetOption.isSendable()
  ) {
    await interaction.reply({
      content: "Hedef kanal mesaj gönderilebilen bir sunucu metin kanalı olmalıdır.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  const target = targetOption as BaseGuildTextChannel;

  const botMember = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
  const sourcePermissions = source.permissionsFor(botMember);
  if (!sourcePermissions?.has(PermissionFlagsBits.ViewChannel) || !sourcePermissions.has(PermissionFlagsBits.ReadMessageHistory)) {
    await interaction.reply({
      content: "Bot kaynak kanalı görüntüleme veya mesaj geçmişini okuma yetkisine sahip değil.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let sourceMessage;
  try {
    sourceMessage = await dependencies.announcements.findLatestEligibleMessage(
      source,
      interaction.createdTimestamp,
    );
  } catch (error) {
    await dependencies.logs.error(interaction.guildId, "Duyuru kaynak mesajı okunamadı.", error);
    await interaction.editReply("Kaynak kanalın mesaj geçmişi okunamadı. Bot izinlerini kontrol edin.");
    return true;
  }
  if (!sourceMessage) {
    await interaction.editReply("Duyuru olarak gönderilebilecek önceki bir mesaj bulunamadı.");
    return true;
  }

  const targetPermissions = target.permissionsFor(botMember);
  const missingPermissions: string[] = [];
  if (!targetPermissions?.has(PermissionFlagsBits.ViewChannel)) missingPermissions.push("View Channel");
  if (!targetPermissions?.has(PermissionFlagsBits.SendMessages)) missingPermissions.push("Send Messages");
  if (asEmbed && !targetPermissions?.has(PermissionFlagsBits.EmbedLinks)) missingPermissions.push("Embed Links");
  if (sourceMessage.attachments.size > 0 && !targetPermissions?.has(PermissionFlagsBits.AttachFiles)) {
    missingPermissions.push("Attach Files");
  }
  if (missingPermissions.length > 0) {
    await interaction.editReply(`Botun hedef kanalda şu izinleri eksik: ${missingPermissions.join(", ")}.`);
    return true;
  }

  const lockKey = `${interaction.guildId}:${sourceMessage.id}:${target.id}`;
  if (activeAnnouncements.has(lockKey)) {
    await interaction.editReply("Bu mesaj aynı hedef kanal için şu anda başka bir yönetici tarafından duyuruluyor.");
    return true;
  }
  const recentTimestamp = recentAnnouncements.get(lockKey);
  if (recentTimestamp && Date.now() - recentTimestamp < DUPLICATE_WINDOW_MS) {
    await interaction.editReply("Bu mesaj aynı hedef kanala az önce duyuruldu. Yinelenen işlem engellendi.");
    return true;
  }
  activeAnnouncements.add(lockKey);
  try {
    const result = await dependencies.announcements.publish(sourceMessage, target, asEmbed);
    const completedAt = Date.now();
    recentAnnouncements.set(lockKey, completedAt);
    const cleanupTimer = setTimeout(() => {
      if (recentAnnouncements.get(lockKey) === completedAt) recentAnnouncements.delete(lockKey);
    }, DUPLICATE_WINDOW_MS);
    cleanupTimer.unref();
    const failedText =
      result.failedAttachments.length > 0
        ? ` Ancak şu dosyalar aktarılamadı: ${result.failedAttachments
            .map((name) => `\`${escapeInlineCode(name)}\``)
            .join(", ")}.`
        : "";
    await interaction.editReply(`✅ Duyuru <#${target.id}> kanalına gönderildi.${failedText}`);
    await dependencies.logs.info(
      interaction.guildId,
      `<@${interaction.user.id}> <#${source.id}> kanalındaki ${sourceMessage.id} mesajını <#${target.id}> kanalına ${asEmbed ? "embed" : "normal mesaj"} olarak duyurdu.${result.failedAttachments.length > 0 ? ` Aktarılamayan dosya: ${result.failedAttachments.length}.` : ""}`,
    );
  } catch (error) {
    await dependencies.logs.error(interaction.guildId, "Duyuru gönderilemedi.", error);
    const detail = error instanceof Error ? ` ${error.message.slice(0, 1_000)}` : "";
    await interaction.editReply(`Duyuru gönderilemedi.${detail}`);
  } finally {
    activeAnnouncements.delete(lockKey);
  }
  return true;
}
