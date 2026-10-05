import { SlashCommandBuilder } from "discord.js";

export const stageMusicCommands = [
  new SlashCommandBuilder()
    .setName("sahnebasla")
    .setDescription("Yapılandırılmış Stage kanalında bekleme müziğini başlatır")
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("sahnedur")
    .setDescription("Stage müziğini bulunduğu konumda duraklatır")
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("sahnedevam")
    .setDescription("Duraklatılmış Stage müziğini sürdürür")
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("sahnebit")
    .setDescription("Stage müzik oturumunu kapatır ve kanaldan ayrılır")
    .setDMPermission(false),
] as const;

export const STAGE_MUSIC_COMMAND_NAMES = new Set(
  stageMusicCommands.map((command) => command.name),
);
