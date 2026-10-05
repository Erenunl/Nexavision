import {
  ActionRowBuilder,
  ChannelType,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Interaction,
} from "discord.js";
import { getCountry } from "../../config/countries.js";
import { CUSTOM_IDS } from "../../config/constants.js";
import type { CountryApplicationRepository } from "../../database/countryApplicationRepository.js";
import {
  buildCountryApplicationEmbed,
  buildCountryReviewButtons,
} from "../../embeds/countryApplicationEmbed.js";
import type { AuthorizationService } from "../../services/authorizationService.js";
import type { CountryPanelService } from "../../services/countryPanelService.js";
import type { CountryRoleService } from "../../services/countryRoleService.js";
import type { GuildConfigService } from "../../services/guildConfigService.js";
import type { LogService } from "../../services/logService.js";
import type { ContestStatusService } from "../../services/contestStatusService.js";

const approvalLocks = new Set<number>();

function parseApplicationId(customId: string, prefix: string): number | null {
  const raw = customId.slice(prefix.length);
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function resultMessage(
  reason: "already_assigned" | "country_taken" | "user_pending" | "country_pending",
  requestedCountryCode: string,
  existingCountryCode?: string,
): string {
  const requested = getCountry(requestedCountryCode);
  const existing = existingCountryCode ? getCountry(existingCountryCode) : null;
  if (reason === "already_assigned") {
    return existing
      ? `Zaten ${existing.flag} ${existing.nameTr} ülkesini temsil ediyorsun.`
      : "Zaten bir ülkeyi temsil ediyorsun.";
  }
  if (reason === "country_taken") {
    return requested
      ? `${requested.flag} ${requested.nameTr} ülkesinin zaten bir temsilcisi bulunuyor.`
      : "Bu ülkenin zaten bir temsilcisi bulunuyor.";
  }
  if (reason === "user_pending") return "Zaten yönetici incelemesini bekleyen bir ülke başvurun var.";
  return requested
    ? `${requested.flag} ${requested.nameTr} için başka bir başvuru yönetici incelemesini bekliyor.`
    : "Bu ülke için başka bir başvuru yönetici incelemesini bekliyor.";
}

async function canReview(interaction: Interaction, authorization: AuthorizationService): Promise<boolean> {
  if (!interaction.inCachedGuild()) return false;
  const member = interaction.member;
  if (authorization.canManageSettings(interaction.guild, member)) return true;
  if (interaction.isRepliable()) {
    await interaction.reply({
      content: "Bu ülke başvurusunu incelemek için yetkin bulunmuyor.",
      flags: MessageFlags.Ephemeral,
    });
  }
  return false;
}

export async function handleCountryInteraction(
  interaction: Interaction,
  dependencies: {
    configs: GuildConfigService;
    authorization: AuthorizationService;
    applications: CountryApplicationRepository;
    roles: CountryRoleService;
    panels: CountryPanelService;
    logs: LogService;
    contestStatus: ContestStatusService;
  },
): Promise<boolean> {
  const { configs, authorization, applications, roles, panels, logs, contestStatus } = dependencies;
  const customId = "customId" in interaction ? interaction.customId : "";
  const isCountryInteraction =
    customId.startsWith(CUSTOM_IDS.countryApplyPrefix) ||
    customId.startsWith(CUSTOM_IDS.countryApprovePrefix) ||
    customId.startsWith(CUSTOM_IDS.countryRejectPrefix) ||
    customId.startsWith(CUSTOM_IDS.countryRejectModalPrefix);
  if (!isCountryInteraction) return false;
  if (!interaction.inCachedGuild()) return true;

  if (interaction.isStringSelectMenu() && customId.startsWith(CUSTOM_IDS.countryApplyPrefix)) {
    const config = configs.get(interaction.guildId);
    if (!config.countryApplicationsOpen) {
      await interaction.reply({ content: "Ülke başvuruları şu anda kapalıdır.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (interaction.channelId !== config.channels.countryApplication) {
      await interaction.reply({ content: "Bu ülke başvuru paneli artık aktif değil.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!config.countryRolesInitialized) {
      await interaction.reply({ content: "Ülke rolleri henüz kurulmadı.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const countryCode = interaction.values[0];
    const country = countryCode ? getCountry(countryCode) : null;
    if (!country) {
      await interaction.reply({ content: "Geçersiz ülke seçimi.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const adminChannelId = config.channels.adminApproval;
    const adminChannel = adminChannelId
      ? await interaction.client.channels.fetch(adminChannelId).catch(() => null)
      : null;
    if (
      !adminChannel ||
      adminChannel.type !== ChannelType.GuildText ||
      adminChannel.guildId !== interaction.guildId
    ) {
      await interaction.reply({
        content: "Admin onay kanalı ayarlanmamış veya artık mevcut değil.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let created;
    try {
      created = applications.createPending(interaction.guildId, interaction.user.id, country.code);
    } catch (error) {
      await logs.error(interaction.guildId, "Ülke başvurusu database'e kaydedilemedi.", error);
      await interaction.editReply("Başvuru kaydedilemedi. Lütfen tekrar deneyin.");
      return true;
    }
    if (!created.ok) {
      await interaction.editReply(resultMessage(created.reason, country.code, created.countryCode));
      return true;
    }

    let adminMessage;
    try {
      adminMessage = await adminChannel.send({
        embeds: [buildCountryApplicationEmbed(created.application)],
        components: [buildCountryReviewButtons(created.application.id)],
      });
      applications.attachAdminMessage(created.application.id, adminChannel.id, adminMessage.id);
    } catch (error) {
      await adminMessage?.delete().catch(() => undefined);
      applications.rejectSystemFailure(created.application.id, "Admin onay mesajı gönderilemedi.");
      await logs.error(interaction.guildId, `#${created.application.id} ülke başvurusu iletilemedi.`, error);
      await interaction.editReply("Başvuru admin onay kanalına iletilemedi. Lütfen daha sonra tekrar deneyin.");
      return true;
    }

    await interaction.editReply(`${country.flag} ${country.nameTr} için başvurun yönetici onayına gönderildi.`);
    return true;
  }

  if (interaction.isButton() && customId.startsWith(CUSTOM_IDS.countryApprovePrefix)) {
    if (!(await canReview(interaction, authorization))) return true;
    const id = parseApplicationId(customId, CUSTOM_IDS.countryApprovePrefix);
    const application = id ? applications.findById(id) : null;
    if (!application || application.guildId !== interaction.guildId) {
      await interaction.reply({ content: "Ülke başvurusu bulunamadı.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (approvalLocks.has(application.id)) {
      await interaction.reply({ content: "Bu başvuru şu anda başka bir yönetici tarafından işleniyor.", flags: MessageFlags.Ephemeral });
      return true;
    }
    approvalLocks.add(application.id);
    await interaction.deferUpdate();
    let granted: Awaited<ReturnType<CountryRoleService["grantCountryRole"]>> | null = null;
    try {
      const eligibility = applications.checkApproval(application.id);
      if (!eligibility.ok) {
        await interaction.followUp({
          content:
            eligibility.reason === "not_pending"
              ? "Bu başvuru daha önce sonuçlandırılmış."
              : resultMessage(eligibility.reason, application.countryCode, eligibility.countryCode),
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      try {
        granted = await roles.grantCountryRole(
          interaction.guild,
          application.discordUserId,
          application.countryCode,
        );
      } catch (error) {
        await logs.error(interaction.guildId, `#${application.id} için ülke rolü verilemedi.`, error);
        const message =
          error instanceof Error && error.message.startsWith("COUNTRY_ROLE_NOT_FOUND")
            ? "Bu ülkenin Discord rolü bulunamadı. `/ülkeayarla` ile rolleri onarın. Başvuru beklemede bırakıldı."
            : error instanceof Error && error.message.startsWith("GUILD_MEMBER_NOT_FOUND")
              ? "Başvuran kullanıcı artık sunucuda değil. Başvuru beklemede bırakıldı."
              : "Ülke rolü kullanıcıya verilemedi. Bot rol sırasını ve Manage Roles iznini kontrol edin.";
        await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
        return true;
      }

      let approval;
      let databaseFailure = false;
      try {
        approval = applications.approveAndAssign(application.id, interaction.user.id);
      } catch (error) {
        databaseFailure = true;
        await logs.error(interaction.guildId, `#${application.id} assignment kaydedilemedi.`, error);
        approval = { ok: false as const, reason: "not_pending" as const };
      }
      if (!approval.ok) {
        let rollbackFailed = false;
        if (
          granted.roleAdded &&
          !applications.hasActiveAssignment(
            application.guildId,
            application.discordUserId,
            application.countryCode,
          )
        ) {
          try {
            await roles.removeCountryRole(granted.member, granted.role);
          } catch (rollbackError) {
            rollbackFailed = true;
            await logs.error(
              interaction.guildId,
              `#${application.id} başarısız assignment sonrası ülke rolü geri alınamadı.`,
              rollbackError,
            );
          }
        }
        await interaction.followUp({
          content:
            rollbackFailed
              ? "Assignment tamamlanamadı ve eklenen ülke rolü otomatik geri alınamadı. Rolü kullanıcıdan manuel kaldırın."
              : databaseFailure
                ? "Assignment database'e kaydedilemedi; eklenen rol geri alındı ve başvuru beklemede bırakıldı."
                : approval.reason === "not_pending"
              ? "Başvuru başka bir yönetici tarafından sonuçlandırıldı; assignment yapılmadı."
              : resultMessage(approval.reason, application.countryCode, approval.countryCode),
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      const approved = applications.findById(application.id)!;
      try {
        await interaction.editReply({
          embeds: [buildCountryApplicationEmbed(approved)],
          components: [buildCountryReviewButtons(approved.id, true)],
        });
      } catch (error) {
        await logs.error(interaction.guildId, `#${application.id} onay mesajı güncellenemedi.`, error);
      }

      try {
        await panels.syncAll(interaction.guildId);
      } catch (error) {
        await logs.error(interaction.guildId, `#${application.id} onayı sonrası ülke panelleri güncellenemedi.`, error);
        await interaction.followUp({
          content: "Assignment ve rol tamamlandı; ülke listesi/paneli güncellenemedi. Kanal izinlerini kontrol edin.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await contestStatus.sync(interaction.guildId).catch((error) =>
        logs.error(interaction.guildId, "Ülke onayı sonrası yarışma durum paneli güncellenemedi.", error),
      );

      const country = getCountry(application.countryCode);
      try {
        const user = await interaction.client.users.fetch(application.discordUserId);
        await user.send(
          `${country?.flag ?? "🌍"} ${country?.nameTr ?? application.countryCode} başvurun onaylandı! Artık yarışmada bu ülkeyi temsil ediyorsun.`,
        );
      } catch {
        // DM kapalıysa assignment tamamlanmış olarak kalır.
      }
      return true;
    } finally {
      approvalLocks.delete(application.id);
    }
  }

  if (interaction.isButton() && customId.startsWith(CUSTOM_IDS.countryRejectPrefix)) {
    if (!(await canReview(interaction, authorization))) return true;
    const id = parseApplicationId(customId, CUSTOM_IDS.countryRejectPrefix);
    const application = id ? applications.findById(id) : null;
    if (!application || application.guildId !== interaction.guildId) {
      await interaction.reply({ content: "Ülke başvurusu bulunamadı.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (application.status !== "PENDING") {
      await interaction.reply({ content: "Bu başvuru daha önce sonuçlandırılmış.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const reasonInput = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Ret sebebi")
      .setStyle(TextInputStyle.Paragraph)
      .setMinLength(3)
      .setMaxLength(1_000)
      .setRequired(true);
    const modal = new ModalBuilder()
      .setCustomId(`${CUSTOM_IDS.countryRejectModalPrefix}${application.id}`)
      .setTitle("Ülke Başvurusunu Reddet")
      .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isModalSubmit() && customId.startsWith(CUSTOM_IDS.countryRejectModalPrefix)) {
    if (!(await canReview(interaction, authorization))) return true;
    const id = parseApplicationId(customId, CUSTOM_IDS.countryRejectModalPrefix);
    const application = id ? applications.findById(id) : null;
    if (!application || application.guildId !== interaction.guildId) {
      await interaction.reply({ content: "Ülke başvurusu bulunamadı.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const reason = interaction.fields.getTextInputValue("reason").trim();
    if (reason.length < 3) {
      await interaction.reply({ content: "Ret sebebi en az 3 karakter olmalı.", flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!applications.rejectIfPending(application.id, interaction.user.id, reason)) {
      await interaction.editReply("Bu başvuru başka bir yönetici tarafından sonuçlandırıldı.");
      return true;
    }
    const rejected = applications.findById(application.id)!;
    if (rejected.adminChannelId && rejected.adminMessageId) {
      try {
        const channel = await interaction.client.channels.fetch(rejected.adminChannelId);
        if (channel?.isTextBased() && "messages" in channel) {
          const message = await channel.messages.fetch(rejected.adminMessageId);
          await message.edit({
            embeds: [buildCountryApplicationEmbed(rejected)],
            components: [buildCountryReviewButtons(rejected.id, true)],
          });
        }
      } catch (error) {
        await logs.error(interaction.guildId, `#${rejected.id} ülke admin mesajı güncellenemedi.`, error);
      }
    }
    const country = getCountry(rejected.countryCode);
    try {
      const user = await interaction.client.users.fetch(rejected.discordUserId);
      await user.send(
        `${country?.flag ?? "🌍"} ${country?.nameTr ?? rejected.countryCode} başvurun reddedildi.\n\nSebep: ${reason}`,
      );
    } catch {
      // DM kapalıysa ret işlemi etkilenmez.
    }
    await interaction.editReply("✅ Ülke başvurusu reddedildi.");
    return true;
  }

  return true;
}
