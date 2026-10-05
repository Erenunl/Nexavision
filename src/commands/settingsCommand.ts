import { SlashCommandBuilder } from "discord.js";

export const settingsCommand = new SlashCommandBuilder()
  .setName("ayar")
  .setDescription("Sunucu bot ayarlarını açar")
  .setDMPermission(false);
