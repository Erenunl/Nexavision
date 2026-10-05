import { SlashCommandBuilder } from "discord.js";

export const countrySetupCommand = new SlashCommandBuilder()
  .setName("ülkeayarla")
  .setDescription("Eurovision ülke rollerini kurar veya eksik rolleri onarır")
  .setDMPermission(false);
