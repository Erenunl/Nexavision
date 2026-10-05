import { ChannelType, SlashCommandBuilder } from "discord.js";

export const announcementCommand = new SlashCommandBuilder()
  .setName("duyuru")
  .setDescription("Önceki uygun mesajı seçilen kanala duyurur")
  .setDMPermission(false)
  .addChannelOption((option) =>
    option
      .setName("kanal")
      .setDescription("Duyurunun gönderileceği kanal")
      .setRequired(true)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
  )
  .addBooleanOption((option) =>
    option
      .setName("embed")
      .setDescription("Mesajı Discord embed biçiminde gönder")
      .setRequired(true),
  );
