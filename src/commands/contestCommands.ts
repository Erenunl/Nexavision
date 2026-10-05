import { SlashCommandBuilder } from "discord.js";

export const reminderCommand = new SlashCommandBuilder()
  .setName("hatirlat")
  .setDescription("Eksik yarışma işlemleri için DM hatırlatması gönderir")
  .setDMPermission(false)
  .addSubcommand((subcommand) => subcommand.setName("sarki").setDescription("Şarkısı eksik temsilcilere hatırlat"))
  .addSubcommand((subcommand) => subcommand.setName("oy").setDescription("Oyu eksik temsilcilere hatırlat"));

export const votingToggleCommand = new SlashCommandBuilder()
  .setName("oylama")
  .setDescription("Oylamayı açar veya kapatır")
  .setDMPermission(false)
  .addSubcommand((subcommand) => subcommand.setName("ac").setDescription("Oylamayı aç"))
  .addSubcommand((subcommand) => subcommand.setName("kapat").setDescription("Oylamayı kapat"));

export const voteCommand = new SlashCommandBuilder()
  .setName("oyla")
  .setDescription("Eurovision puanlarını oluşturur veya düzenler")
  .setDMPermission(false);

export const voteControlCommand = new SlashCommandBuilder()
  .setName("oykontrol")
  .setDescription("Oy tamamlama durumunu veya belirli bir pusulayı denetler")
  .setDMPermission(false)
  .addUserOption((option) =>
    option.setName("kullanici").setDescription("Tam pusulası audit edilmek istenen kullanıcı"),
  );

export const voteResetCommand = new SlashCommandBuilder()
  .setName("oysifirla")
  .setDescription("Bir temsilcinin oy pusulasını onay sonrasında sıfırlar")
  .setDMPermission(false)
  .addUserOption((option) =>
    option.setName("kullanici").setDescription("Pusulası sıfırlanacak kullanıcı").setRequired(true),
  );

export const songLockCommand = new SlashCommandBuilder()
  .setName("sarkikilidi")
  .setDescription("Bir ülkenin onaylanmış şarkı kilidini yönetir")
  .setDMPermission(false)
  .addStringOption((option) =>
    option.setName("ulke").setDescription("Ülke adı veya kodu").setRequired(true).setAutocomplete(true),
  )
  .addStringOption((option) =>
    option
      .setName("durum")
      .setDescription("Yeni kilit durumu")
      .setRequired(true)
      .addChoices(
        { name: "Kilitli", value: "kilitli" },
        { name: "Açık", value: "acik" },
      ),
  );

export const resultCommand = new SlashCommandBuilder().setName('sonuc').setDescription('Sonuç snapshot işlemleri').setDMPermission(false).addSubcommand(s=>s.setName('hazirla').setDescription('Gizli ve immutable sonuç snapshotı hazırlar'));
export const resultStartCommand = new SlashCommandBuilder().setName('sonucbaslat').setDescription('Hazırlanmış sonuç gecesini başlatır').setDMPermission(false);
export const resultNextCommand = new SlashCommandBuilder().setName('sonraki').setDescription('Sıradaki ülkenin oylarını açıklar').setDMPermission(false);
export const resultPauseCommand = new SlashCommandBuilder().setName('sonucdur').setDescription('Sonuç açıklamasını duraklatır').setDMPermission(false);
export const resultResumeCommand = new SlashCommandBuilder().setName('sonucdevam').setDescription('Sonuç açıklamasına devam eder').setDMPermission(false);
export const resultFinishCommand = new SlashCommandBuilder().setName('sonucbitir').setDescription('Sonuç oturumunu erken bitirir').setDMPermission(false);
export const countryManageCommand = new SlashCommandBuilder().setName('ulke').setDescription('Ülke temsilcisi ve başvurularını yönetir').setDMPermission(false)
 .addSubcommand(s=>s.setName('temsilcikaldir').setDescription('Ülke temsilcisini kaldırır').addStringOption(o=>o.setName('ulke').setDescription('Ülke').setRequired(true).setAutocomplete(true)))
 .addSubcommand(s=>s.setName('temsilcidegistir').setDescription('Ülke temsilcisini değiştirir').addStringOption(o=>o.setName('ulke').setDescription('Ülke').setRequired(true).setAutocomplete(true)).addUserOption(o=>o.setName('kullanici').setDescription('Yeni temsilci').setRequired(true)))
 .addSubcommand(s=>s.setName('basvuruac').setDescription('Ülke başvurularını açar'))
 .addSubcommand(s=>s.setName('basvurukapat').setDescription('Ülke başvurularını kapatır'));
export const songChangeCommand = new SlashCommandBuilder().setName('sarkidegistir').setDescription('Kilitli resmi şarkı için değişiklik talebi oluşturur').setDMPermission(false).addStringOption(o=>o.setName('youtube_url').setDescription('Yeni YouTube video URLsi').setRequired(true));

export const contestCommands = [
  reminderCommand,
  votingToggleCommand,
  voteCommand,
  voteControlCommand,
  voteResetCommand,
  songLockCommand,
  resultCommand,resultStartCommand,resultNextCommand,resultPauseCommand,resultResumeCommand,resultFinishCommand,countryManageCommand,songChangeCommand,
] as const;
