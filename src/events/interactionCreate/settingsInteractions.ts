import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type Guild,
  type Interaction,
} from "discord.js";
import { CUSTOM_IDS, DATA_CHANNEL_ID } from "../../config/constants.js";
import type { ConfigChannelKey } from "../../types/guildConfig.js";
import type { AuthorizationService } from "../../services/authorizationService.js";
import type { GuildConfigService } from "../../services/guildConfigService.js";
import type { CountryPanelService } from "../../services/countryPanelService.js";
import type { LogService } from "../../services/logService.js";
import type { ContestStatusService } from "../../services/contestStatusService.js";
import type { ResultService } from "../../services/resultService.js";
import type { NowPlayingService } from "../../services/nowPlayingService.js";
import { formatNumber } from "../../utils/format.js";

const CHANNEL_LABELS: Record<ConfigChannelKey, string> = {
  songSubmission: "Şarkı Gönderim Kanalı",
  adminApproval: "Admin Onay Kanalı",
  officialEntries: "Resmi Şarkılar Kanalı",
  logs: "Log Kanalı",
  countryList: "Ülke Listesi Kanalı",
  countryApplication: "Ülke Başvuru Kanalı",
  stage: "Sahne Kanalı",
  contestStatus: "Yarışma Durum Kanalı",
  results: "Sonuç Kanalı",
  scoreboard: "Scoreboard Kanalı",
  nowPlaying: "Şimdi Çalıyor Kanalı",
};

function mainPanel() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(CUSTOM_IDS.settingsSection)
    .setPlaceholder("Bir ayar bölümü seçin")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Kanal Ayarları")
        .setValue("channels")
        .setEmoji("#️⃣"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Yetki Ayarları")
        .setValue("permissions")
        .setEmoji("🛡️"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Şarkı Kuralları")
        .setValue("rules")
        .setEmoji("🎵"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Yarışma Takvimi")
        .setValue("deadlines")
        .setEmoji("⏰"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Mevcut Ayarlar")
        .setValue("current")
        .setEmoji("📋"),
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function channelKeyRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(CUSTOM_IDS.settingsChannelKey)
    .setPlaceholder("Ayarlanacak kanalı seçin")
    .addOptions(
      (Object.entries(CHANNEL_LABELS) as Array<[ConfigChannelKey, string]>).map(([key, label]) =>
        new StringSelectMenuOptionBuilder().setLabel(label).setValue(key),
      ),
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function channelSelector(key: ConfigChannelKey) {
  const channelType = key === "stage" ? ChannelType.GuildStageVoice : ChannelType.GuildText;
  return new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`${CUSTOM_IDS.settingsChannelPrefix}${key}`)
      .setPlaceholder(CHANNEL_LABELS[key])
      .setChannelTypes(channelType)
      .setMinValues(1)
      .setMaxValues(1),
  );
}

function currentSettingsEmbed(guild: Guild, configs: GuildConfigService): EmbedBuilder {
  const config = configs.get(guild.id);
  const channelValue = (id: string | null) => {
    if (!id) return "Ayarlanmamış";
    return configs.channelExists(guild, id) ? `<#${id}>` : `⚠️ Kayıtlı kanal artık mevcut değil (${id})`;
  };
  const roleValue = (id: string | null) => {
    if (!id) return "Ayarlanmamış";
    return configs.roleExists(guild, id) ? `<@&${id}>` : `⚠️ Kayıtlı rol artık mevcut değil (${id})`;
  };

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Sunucu Ayarları")
    .addFields(
      {
        name: "Kanal Ayarları",
        value: [
          `Şarkı Gönderimi: ${channelValue(config.channels.songSubmission)}`,
          `Admin Onay: ${channelValue(config.channels.adminApproval)}`,
          `Resmi Şarkılar: ${channelValue(config.channels.officialEntries)}`,
          `Log: ${channelValue(config.channels.logs)}`,
          `Ülke Listesi: ${channelValue(config.channels.countryList)}`,
          `Ülke Başvurusu: ${channelValue(config.channels.countryApplication)}`,
          `Sahne: ${channelValue(config.channels.stage)}`,
          `Yarışma Durumu: ${channelValue(config.channels.contestStatus)}`,
          `Sonuç: ${channelValue(config.channels.results)}`,
          `Scoreboard: ${channelValue(config.channels.scoreboard)}`,
          `Şimdi Çalıyor: ${channelValue(config.channels.nowPlaying)}`,
        ].join("\n"),
      },
      { name: "Yetkiler", value: `Admin Rolü: ${roleValue(config.roles.admin)}\nKazanan Rolü: ${roleValue(config.roles.winner)}` },
      {
        name: "Ülke Rolleri",
        value: config.countryRolesInitialized
          ? `Hazır (${Object.keys(config.countryRoles).length}/50)`
          : `Kurulum tamamlanmadı (${Object.keys(config.countryRoles).length}/50)`,
      },
      {
        name: "Şarkı Kuralları",
        value: `Maksimum görüntülenme: ${formatNumber(config.songRules.maxViewCount)}`,
      },
      {
        name: "Yarışma Takvimi",
        value: [
          `Şarkı Teslimi: ${config.deadlines.songSubmission ? `<t:${config.deadlines.songSubmission}:F>` : "Ayarlanmamış"}`,
          `Oylama: ${config.deadlines.voting ? `<t:${config.deadlines.voting}:F>` : "Ayarlanmamış"}`,
          `Oylama Durumu: ${config.votingOpen ? "Açık" : "Kapalı"}`,
        ].join("\n"),
      },
    );
}

async function ensureAuthorized(
  interaction: Interaction,
  authorization: AuthorizationService,
): Promise<boolean> {
  if (!interaction.inCachedGuild()) return false;
  // Cached guild interactions already carry the invoking GuildMember. Fetching
  // the same member over the REST API here can consume Discord's three-second
  // acknowledgement window and make `/ayar` appear to time out before its
  // select menu is rendered.
  const member = interaction.member;
  if (authorization.canManageSettings(interaction.guild, member)) return true;

  if (interaction.isRepliable()) {
    await interaction.reply({
      content: "Bu ayarları değiştirmek için yetkin bulunmuyor.",
      flags: MessageFlags.Ephemeral,
    });
  }
  return false;
}

async function openSettings(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({
    content: "Yapılandırmak istediğiniz bölümü seçin.",
    components: [mainPanel()],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleSettingsInteraction(
  interaction: Interaction,
  configs: GuildConfigService,
  authorization: AuthorizationService,
  panels: CountryPanelService,
  logs: LogService,
  contestStatus: ContestStatusService,
  results: ResultService,
  nowPlaying: NowPlayingService,
): Promise<boolean> {
  const isSettingsInteraction =
    (interaction.isChatInputCommand() && interaction.commandName === "ayar") ||
    ("customId" in interaction && typeof interaction.customId === "string" && interaction.customId.startsWith("settings:"));
  if (!isSettingsInteraction) return false;
  if (!(await ensureAuthorized(interaction, authorization))) return true;
  if (!interaction.inCachedGuild()) return true;

  if (interaction.isChatInputCommand()) {
    await openSettings(interaction);
    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === CUSTOM_IDS.settingsSection) {
    const section = interaction.values[0];
    if (section === "channels") {
      await interaction.update({
        content: "Ayarlamak istediğiniz kanal türünü seçin.",
        embeds: [],
        components: [channelKeyRow()],
      });
    } else if (section === "permissions") {
      const roleMenu = new RoleSelectMenuBuilder()
        .setCustomId(CUSTOM_IDS.settingsAdminRole)
        .setPlaceholder("Admin rolünü seçin")
        .setMinValues(1)
        .setMaxValues(1);
      const winnerMenu = new RoleSelectMenuBuilder()
        .setCustomId(CUSTOM_IDS.settingsWinnerRole)
        .setPlaceholder("Kazanan rolünü seçin")
        .setMinValues(1)
        .setMaxValues(1);
      await interaction.update({
        content: "Bot yönetimi, şarkı ve ülke incelemesi yapacak rolü seçin.",
        embeds: [],
        components: [new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleMenu), new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(winnerMenu)],
      });
    } else if (section === "rules") {
      const button = new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.settingsMaxViewsButton)
        .setLabel("Maksimum Görüntülenmeyi Değiştir")
        .setStyle(ButtonStyle.Primary);
      await interaction.update({
        content: `Mevcut limit: ${formatNumber(configs.get(interaction.guildId).songRules.maxViewCount)}`,
        embeds: [],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
      });
    } else if (section === "deadlines") {
      const song = new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.settingsDeadlineSong)
        .setLabel("Şarkı Teslim Deadline")
        .setStyle(ButtonStyle.Primary);
      const voting = new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.settingsDeadlineVoting)
        .setLabel("Oylama Deadline")
        .setStyle(ButtonStyle.Primary);
      await interaction.update({
        content: "Deadline seçin. Tarihler UTC olarak girilir ve Discord yerel saatle gösterir.",
        embeds: [],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(song, voting)],
      });
    } else if (section === "current") {
      await interaction.update({ content: "", embeds: [currentSettingsEmbed(interaction.guild, configs)], components: [mainPanel()] });
    }
    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === CUSTOM_IDS.settingsChannelKey) {
    const key = interaction.values[0] as ConfigChannelKey | undefined;
    if (!key || !(key in CHANNEL_LABELS)) {
      await interaction.reply({ content: "Bilinmeyen kanal ayarı.", flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.update({
      content: `${CHANNEL_LABELS[key]} için bir ${key === "stage" ? "Stage" : "metin"} kanalı seçin.`,
      embeds: [],
      components: [channelSelector(key)],
    });
    return true;
  }

  if (interaction.isChannelSelectMenu() && interaction.customId.startsWith(CUSTOM_IDS.settingsChannelPrefix)) {
    const key = interaction.customId.slice(CUSTOM_IDS.settingsChannelPrefix.length) as ConfigChannelKey;
    if (!(key in CHANNEL_LABELS)) {
      await interaction.reply({ content: "Bilinmeyen kanal ayarı.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const channelId = interaction.values[0];
    if (!channelId) return true;
    if (channelId === DATA_CHANNEL_ID) {
      await interaction.reply({
        content: "Internal data kanalı yarışma kanalı olarak seçilemez.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    await interaction.deferUpdate();
    await configs.setChannel(interaction.guildId, key, channelId);
    let syncWarning = "";
    try {
      if (key === "countryList") await panels.syncCountryList(interaction.guildId);
      if (key === "countryApplication") await panels.syncAll(interaction.guildId);
      if (key === "contestStatus") await contestStatus.sync(interaction.guildId);
      if (key === "scoreboard") await results.syncScoreboard(interaction.guildId);
      if (key === "nowPlaying") await nowPlaying.update(interaction.guildId,"STOPPED",null);
    } catch (error) {
      syncWarning = " Ancak kalıcı panel oluşturulamadı; botun kanal izinlerini kontrol edin.";
      await logs.error(interaction.guildId, `${CHANNEL_LABELS[key]} değişikliği sonrası panel sync başarısız.`, error);
    }
    await interaction.editReply({
      content: `✅ ${CHANNEL_LABELS[key]} <#${channelId}> olarak ayarlandı.${syncWarning}`,
      components: [],
    });
    return true;
  }

  if (interaction.isRoleSelectMenu() && interaction.customId === CUSTOM_IDS.settingsAdminRole) {
    const roleId = interaction.values[0];
    if (!roleId) return true;
    const role = interaction.guild.roles.cache.get(roleId) ?? (await interaction.guild.roles.fetch(roleId));
    if (!role || role.id === interaction.guild.id || role.managed) {
      await interaction.reply({
        content: "@everyone veya entegrasyon tarafından yönetilen bir rol admin rolü olarak seçilemez.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    await configs.setAdminRole(interaction.guildId, roleId);
    await interaction.update({ content: `✅ Admin rolü <@&${roleId}> olarak ayarlandı.`, components: [] });
    return true;
  }

  if (interaction.isRoleSelectMenu() && interaction.customId === CUSTOM_IDS.settingsWinnerRole) {
    const roleId=interaction.values[0]; if(!roleId)return true; const role=interaction.guild.roles.cache.get(roleId)??await interaction.guild.roles.fetch(roleId); if(!role||role.id===interaction.guild.id||role.managed){await interaction.reply({content:'@everyone veya yönetilen rol kazanan rolü olamaz.',flags:MessageFlags.Ephemeral});return true;} await configs.setWinnerRole(interaction.guildId,roleId);await interaction.update({content:`✅ Kazanan rolü <@&${roleId}> olarak ayarlandı.`,components:[]});return true;
  }

  if (interaction.isButton() && interaction.customId === CUSTOM_IDS.settingsMaxViewsButton) {
    const input = new TextInputBuilder()
      .setCustomId("maxViewCount")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(12)
      .setValue(String(configs.get(interaction.guildId).songRules.maxViewCount));
    input.setLabel("Görüntülenme limiti");
    const modal = new ModalBuilder()
      .setCustomId(CUSTOM_IDS.settingsMaxViewsModal)
      .setTitle("Maksimum Görüntülenme")
      .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return true;
  }

  if (
    interaction.isButton() &&
    (interaction.customId === CUSTOM_IDS.settingsDeadlineSong ||
      interaction.customId === CUSTOM_IDS.settingsDeadlineVoting)
  ) {
    const key = interaction.customId === CUSTOM_IDS.settingsDeadlineSong ? "songSubmission" : "voting";
    const current = configs.get(interaction.guildId).deadlines[key];
    const value = current
      ? new Date(current * 1_000).toISOString().slice(0, 16).replace("T", " ")
      : "";
    const input = new TextInputBuilder()
      .setCustomId("datetime")
      .setLabel("UTC tarih ve saat (YYYY-MM-DD HH:mm)")
      .setPlaceholder("2026-12-31 21:00 — silmek için: sil")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(16);
    if (value) input.setValue(value);
    const modal = new ModalBuilder()
      .setCustomId(`${CUSTOM_IDS.settingsDeadlineModalPrefix}${key}`)
      .setTitle(key === "songSubmission" ? "Şarkı Teslim Deadline" : "Oylama Deadline")
      .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return true;
  }

  if (
    interaction.isModalSubmit() &&
    interaction.customId.startsWith(CUSTOM_IDS.settingsDeadlineModalPrefix)
  ) {
    const key = interaction.customId.slice(CUSTOM_IDS.settingsDeadlineModalPrefix.length);
    if (key !== "songSubmission" && key !== "voting") {
      await interaction.reply({ content: "Geçersiz deadline türü.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const raw = interaction.fields.getTextInputValue("datetime").trim();
    let timestamp: number | null = null;
    if (raw.toLocaleLowerCase("tr") !== "sil") {
      const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(raw);
      if (!match) {
        await interaction.reply({ content: "Tarihi `YYYY-MM-DD HH:mm` biçiminde UTC olarak girin.", flags: MessageFlags.Ephemeral });
        return true;
      }
      const values = match.slice(1).map(Number);
      const [year, month, day, hour, minute] = values as [number, number, number, number, number];
      const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
      if (
        date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day || date.getUTCHours() !== hour || date.getUTCMinutes() !== minute
      ) {
        await interaction.reply({ content: "Geçersiz bir UTC tarih/saat girdiniz.", flags: MessageFlags.Ephemeral });
        return true;
      }
      timestamp = Math.floor(date.getTime() / 1_000);
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await configs.setDeadline(interaction.guildId, key, timestamp);
    await contestStatus.sync(interaction.guildId).catch((error) =>
      logs.error(interaction.guildId, "Deadline sonrası yarışma durum paneli güncellenemedi.", error),
    );
    await interaction.editReply(
      timestamp ? `✅ Deadline <t:${timestamp}:F> (<t:${timestamp}:R>) olarak kaydedildi.` : "✅ Deadline temizlendi.",
    );
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId === CUSTOM_IDS.settingsMaxViewsModal) {
    const raw = interaction.fields.getTextInputValue("maxViewCount").trim();
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value <= 0) {
      await interaction.reply({ content: "Pozitif bir tam sayı girin.", flags: MessageFlags.Ephemeral });
      return true;
    }
    await configs.setMaxViewCount(interaction.guildId, value);
    await interaction.reply({
      content: `✅ Maksimum görüntülenme ${formatNumber(value)} olarak ayarlandı.`,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  return true;
}
