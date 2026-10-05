import {
  ActionRowBuilder,
  ChannelType,
  DiscordAPIError,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type Client,
  type Guild,
  type Message,
  type MessageCreateOptions,
  type TextChannel,
} from "discord.js";
import { EUROVISION_COUNTRIES } from "../config/countries.js";
import { CUSTOM_IDS } from "../config/constants.js";
import type { CountryAssignmentRepository } from "../database/countryAssignmentRepository.js";
import type { ConfigMessageKey } from "../types/guildConfig.js";
import type { GuildConfigService } from "./guildConfigService.js";

export class CountryPanelService {
  constructor(
    private readonly client: Client,
    private readonly configs: GuildConfigService,
    private readonly assignments: CountryAssignmentRepository,
  ) {}

  async syncCountryList(guildId: string): Promise<void> {
    const config = this.configs.get(guildId);
    if (!config.channels.countryList) return;
    const { guild, channel } = await this.resolveChannel(guildId, config.channels.countryList);
    const assignmentByCountry = new Map(
      this.assignments.listActive(guildId).map((assignment) => [assignment.countryCode, assignment]),
    );
    const applicationChannelExists = Boolean(
      config.channels.countryApplication && guild.channels.cache.has(config.channels.countryApplication),
    );
    const applicationHint = applicationChannelExists
      ? `Başvurmak için <#${config.channels.countryApplication}>`
      : "Ülke başvuru kanalı henüz ayarlanmamış.";

    const descriptions = [EUROVISION_COUNTRIES.slice(0, 25), EUROVISION_COUNTRIES.slice(25)].map((countries) =>
      countries
        .map((country) => {
          const assignment = assignmentByCountry.get(country.code);
          return assignment
            ? `**${country.flag} ${country.nameTr}** — <@${assignment.discordUserId}>`
            : `**${country.flag} ${country.nameTr}** — Temsilci henüz yok. ${applicationHint}`;
        })
        .join("\n"),
    );
    const embeds = descriptions.map((description, index) =>
      new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(index === 0 ? "🌍 Eurovision Ülke Listesi" : "🌍 Eurovision Ülke Listesi — Devam")
        .setDescription(description),
    );
    await this.upsertMessage(guildId, channel, "countryList", config.messages.countryList, {
      embeds,
      components: [],
    });
  }

  async syncCountryApplicationPanel(guildId: string): Promise<void> {
    const config = this.configs.get(guildId);
    if (!config.channels.countryApplication) return;
    const { channel } = await this.resolveChannel(guildId, config.channels.countryApplication);
    const assignedCodes = new Set(
      this.assignments.listActive(guildId).map((assignment) => assignment.countryCode),
    );
    const available = EUROVISION_COUNTRIES.filter((country) => !assignedCodes.has(country.code));
    const initialized = config.countryRolesInitialized;
    const description = !config.countryApplicationsOpen
      ? "Ülke başvuruları şu anda kapalıdır."
      : !initialized
      ? "Ülke rolleri henüz kurulmadı. Bir yönetici `/ülkeayarla` komutunu çalıştırmalı."
      : available.length === 0
        ? "Şu anda başvuruya açık ülke bulunmuyor."
        : "Temsil etmek istediğin ülkeyi aşağıdaki listeden seç. Başvurun yönetici onayına gönderilecektir.";
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("🌍 Ülkeni Seç").setDescription(description);

    const rows: Array<ActionRowBuilder<StringSelectMenuBuilder>> = [];
    if (initialized && config.countryApplicationsOpen) {
      for (let index = 0; index < available.length; index += 25) {
        const page = available.slice(index, index + 25);
        const pageNumber = Math.floor(index / 25) + 1;
        const menu = new StringSelectMenuBuilder()
          .setCustomId(`${CUSTOM_IDS.countryApplyPrefix}${pageNumber}`)
          .setPlaceholder(`Ülkeler ${pageNumber}/${Math.ceil(available.length / 25)}`)
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(
            page.map((country) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(country.nameTr)
                .setValue(country.code)
                .setDescription(country.code)
                .setEmoji(country.flag),
            ),
          );
        rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
      }
    }

    await this.upsertMessage(
      guildId,
      channel,
      "countryApplication",
      config.messages.countryApplication,
      { embeds: [embed], components: rows },
    );
  }

  async syncAll(guildId: string): Promise<void> {
    await this.syncCountryList(guildId);
    await this.syncCountryApplicationPanel(guildId);
  }

  private async resolveChannel(guildId: string, channelId: string): Promise<{ guild: Guild; channel: TextChannel }> {
    const guild = this.client.guilds.cache.get(guildId) ?? (await this.client.guilds.fetch(guildId));
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText || channel.guildId !== guildId) {
      throw new Error(`Yapılandırılmış ülke kanalı bulunamadı: ${channelId}`);
    }
    return { guild, channel };
  }

  private async upsertMessage(
    guildId: string,
    channel: TextChannel,
    key: ConfigMessageKey,
    existingMessageId: string | null,
    payload: Pick<MessageCreateOptions, "content" | "embeds" | "components">,
  ): Promise<Message> {
    if (existingMessageId) {
      let existing: Message | null = null;
      try {
        existing = await channel.messages.fetch(existingMessageId);
      } catch (error) {
        if (!(error instanceof DiscordAPIError) || error.code !== 10_008) throw error;
        // Mesaj veya önceki kanal silinmişse aşağıda aynı panel yeniden oluşturulur.
      }
      if (existing && existing.author.id === this.client.user?.id) {
        return await existing.edit(payload);
      }
    }
    const created = await channel.send(payload);
    await this.configs.setMessageId(guildId, key, created.id);
    return created;
  }
}
