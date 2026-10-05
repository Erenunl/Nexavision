import { MessageFlags, type Interaction } from "discord.js";
import type { AuthorizationService } from "../../services/authorizationService.js";
import type { CountryPanelService } from "../../services/countryPanelService.js";
import type { CountryRoleService } from "../../services/countryRoleService.js";
import type { LogService } from "../../services/logService.js";

export async function handleCountrySetupInteraction(
  interaction: Interaction,
  dependencies: {
    authorization: AuthorizationService;
    roles: CountryRoleService;
    panels: CountryPanelService;
    logs: LogService;
  },
): Promise<boolean> {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "ülkeayarla") return false;
  if (!interaction.inCachedGuild()) return true;
  const member = interaction.member;
  if (!dependencies.authorization.canManageSettings(interaction.guild, member)) {
    await interaction.reply({
      content: "Bu komutu kullanmak için bot admin rolüne sahip olmalısın.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const result = await dependencies.roles.initializeRoles(interaction.guild);
    try {
      await dependencies.panels.syncAll(interaction.guildId);
    } catch (error) {
      await dependencies.logs.error(interaction.guildId, "Ülke rolleri sonrası paneller güncellenemedi.", error);
      await interaction.editReply(
        `Ülke rolleri hazır, ancak liste/panel güncellenemedi. Kanal ayarlarını ve bot izinlerini kontrol edin.`,
      );
      return true;
    }
    await interaction.editReply(
      result.alreadyComplete
        ? "Ülke rolleri zaten oluşturulmuş. Tüm 50 rol doğrulandı."
        : `✅ Ülke rolleri hazır. ${result.created} rol oluşturuldu, ${result.reused} mevcut rol yeniden kullanıldı.`,
    );
  } catch (error) {
    await dependencies.logs.error(interaction.guildId, "Ülke rolü kurulumu tamamlanamadı.", error);
    await interaction.editReply(
      "Ülke rolleri tamamen oluşturulamadı. Oluşturulan roller korundu; izinleri düzelttikten sonra komutu tekrar çalıştırın.",
    );
  }
  return true;
}
