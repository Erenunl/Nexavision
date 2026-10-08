import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  type Interaction,
} from "discord.js";
import { EUROVISION_COUNTRIES, getCountry } from "../../config/countries.js";
import { CUSTOM_IDS } from "../../config/constants.js";
import type { CountryAssignmentRepository } from "../../database/countryAssignmentRepository.js";
import type { SubmissionRepository } from "../../database/submissionRepository.js";
import type { VoteRepository } from "../../database/voteRepository.js";
import type { AuthorizationService } from "../../services/authorizationService.js";
import type { ContestStatusService } from "../../services/contestStatusService.js";
import type { GuildConfigService } from "../../services/guildConfigService.js";
import type { LogService } from "../../services/logService.js";
import type { ReminderService } from "../../services/reminderService.js";
import type { ResultService } from "../../services/resultService.js";
import type { CountryRoleService } from "../../services/countryRoleService.js";
import type { CountryPanelService } from "../../services/countryPanelService.js";
import type { CountryAssignmentStateService } from "../../services/countryAssignmentStateService.js";

interface Dependencies {
  authorization: AuthorizationService;
  configs: GuildConfigService;
  assignments: CountryAssignmentRepository;
  submissions: SubmissionRepository;
  votes: VoteRepository;
  reminders: ReminderService;
  status: ContestStatusService;
  logs: LogService;
  results: ResultService;
  countryRoles: CountryRoleService;
  countryPanels: CountryPanelService;
  assignmentState: CountryAssignmentStateService;
}

const ADMIN_COMMANDS = new Set(["hatirlat", "oylama", "oykontrol", "oysifirla", "sarkikilidi","sonuc","sonucbaslat","sonraki","sonucdur","sonucdevam","sonucbitir","ulke","temsilciçıkar"]);

async function authorized(interaction: Interaction, dependencies: Dependencies): Promise<boolean> {
  if (!interaction.inCachedGuild()) return false;
  const member = interaction.member;
  return dependencies.authorization.canManageSettings(interaction.guild, member);
}

function lineFields(name: string, lines: string[], empty: string): Array<{ name: string; value: string }> {
  if (lines.length === 0) return [{ name, value: empty }];
  const chunks: string[] = [];
  let current = "";
  for (const line of lines) {
    if (`${current}\n${line}`.length > 1_024) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) chunks.push(current);
  return chunks.map((value, index) => ({ name: index === 0 ? name : `${name} (devam)`, value }));
}

export async function handleContestAdminInteraction(
  interaction: Interaction,
  dependencies: Dependencies,
): Promise<boolean> {
  const customId = "customId" in interaction ? interaction.customId : "";
  const relevant =
    (interaction.isChatInputCommand() && ADMIN_COMMANDS.has(interaction.commandName)) ||
    (interaction.isAutocomplete() && (interaction.commandName === "sarkikilidi"||interaction.commandName==='ulke')) ||
    (customId.startsWith("vote:reset") || customId.startsWith("result:finish") || customId.startsWith("country:manage"));
  if (!relevant) return false;
  if (!interaction.inCachedGuild()) return true;

  if (!(await authorized(interaction, dependencies))) {
    if (interaction.isAutocomplete()) await interaction.respond([]);
    else if (interaction.isRepliable()) {
      await interaction.reply({ content: "Bu yönetim işlemi için yetkin bulunmuyor.", flags: MessageFlags.Ephemeral });
    }
    return true;
  }

  if (interaction.isAutocomplete()) {
    const query = interaction.options.getFocused().toLocaleLowerCase("tr");
    await interaction.respond(
      EUROVISION_COUNTRIES.filter(
        (country) => country.code.toLocaleLowerCase("tr").includes(query) || country.nameTr.toLocaleLowerCase("tr").includes(query),
      )
        .slice(0, 25)
        .map((country) => ({ name: `${country.flag} ${country.nameTr}`, value: country.code })),
    );
    return true;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "temsilciçıkar") {
    const user = interaction.options.getUser("kullanici", true);
    const assignment = dependencies.assignments.findActiveByUser(interaction.guildId, user.id);
    if (!assignment) {
      await interaction.reply({
        content: `<@${user.id}> kullanıcısının aktif bir ülke temsilciliği bulunmuyor.`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const country = getCountry(assignment.countryCode);
    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CUSTOM_IDS.countryRemovePrefix}${assignment.countryCode}`)
        .setLabel("Evet, Temsilcilikten Çıkar")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.countryRemoveCancel)
        .setLabel("Vazgeç")
        .setStyle(ButtonStyle.Secondary),
    );
    await interaction.reply({
      content: `${country?.flag ?? "🌍"} ${country?.nameTr ?? assignment.countryCode} temsilcisi <@${user.id}> çıkarılsın mı? Ülke rolü de kaldırılacak.`,
      components: [buttons],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if(interaction.isChatInputCommand()&&interaction.commandName==='sonuc'){await interaction.deferReply({flags:MessageFlags.Ephemeral});try{const s=dependencies.results.prepare(interaction.guildId);await dependencies.logs.info(interaction.guildId,`${interaction.user.tag} sonuç snapshotını hazırladı (${s.ballots.length} ballot).`);await interaction.editReply(`✅ ${s.ballots.length} ballot ile immutable sonuç snapshotı hazırlandı.`);}catch(e){await interaction.editReply(e instanceof Error&&e.message==='VOTING_OPEN'?'Önce oylamayı kapatın.':e instanceof Error&&e.message==='NO_BALLOTS'?'Gönderilmiş ballot yok.':'Aktif bir sonuç oturumu zaten var.');}return true;}
  if(interaction.isChatInputCommand()&&interaction.commandName==='sonucbaslat'){await interaction.deferReply({flags:MessageFlags.Ephemeral});try{await dependencies.results.start(interaction.guildId);await dependencies.logs.info(interaction.guildId,`${interaction.user.tag} sonuç gecesini başlattı.`);await interaction.editReply('✅ Sonuç gecesi başlatıldı.');}catch{await interaction.editReply('Hazırlanmış snapshot veya gerekli sonuç/scoreboard kanalı bulunamadı.');}return true;}
  if(interaction.isChatInputCommand()&&interaction.commandName==='sonraki'){await interaction.deferReply({flags:MessageFlags.Ephemeral});try{const r=await dependencies.results.next(interaction.guildId);if(r?.finished)await dependencies.logs.info(interaction.guildId,`${interaction.user.tag} son oyları açıkladı; final sonuç tamamlandı.`);await interaction.editReply(r?`✅ Sıradaki ülkenin oyları açıklandı.${r.finished?' Sonuç oturumu tamamlandı.':''}`:'RUNNING durumda açıklanacak sıradaki oy yok.');}catch(e){await dependencies.logs.error(interaction.guildId,'Sonraki sonuç açıklanamadı.',e);await interaction.editReply('Sonuç veya scoreboard kanalı güncellenemedi.');}return true;}
  if(interaction.isChatInputCommand()&&(interaction.commandName==='sonucdur'||interaction.commandName==='sonucdevam')){const pause=interaction.commandName==='sonucdur';const ok=pause?dependencies.results.pause(interaction.guildId):dependencies.results.resume(interaction.guildId);if(ok)await dependencies.logs.info(interaction.guildId,`${interaction.user.tag} sonuç akışını ${pause?'duraklattı':'devam ettirdi'}.`);await interaction.reply({content:ok?(pause?'⏸️ Sonuç akışı duraklatıldı.':'▶️ Sonuç akışı devam ediyor.'):'Result session uygun durumda değil.',flags:MessageFlags.Ephemeral});return true;}
  if(interaction.isChatInputCommand()&&interaction.commandName==='sonucbitir'){const row=new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(CUSTOM_IDS.resultFinishConfirm).setLabel('Evet, Bitir').setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId(CUSTOM_IDS.resultFinishCancel).setLabel('Vazgeç').setStyle(ButtonStyle.Secondary));await interaction.reply({content:'⚠️ Sonuç oturumu erken bitirilsin mi?',components:[row],flags:MessageFlags.Ephemeral});return true;}
  if(interaction.isButton()&&customId===CUSTOM_IDS.resultFinishConfirm){const ok=dependencies.results.finish(interaction.guildId);if(ok)await dependencies.logs.info(interaction.guildId,`${interaction.user.tag} sonuç oturumunu erken bitirdi.`);await interaction.update({content:ok?'⏹️ Sonuç oturumu bitirildi.':'Oturum uygun durumda değil.',components:[]});return true;}
  if(interaction.isButton()&&customId===CUSTOM_IDS.resultFinishCancel){await interaction.update({content:'İşlem iptal edildi.',components:[]});return true;}

  if(interaction.isChatInputCommand()&&interaction.commandName==='ulke'){
    const sub=interaction.options.getSubcommand();
    if(sub==='basvuruac'||sub==='basvurukapat'){const open=sub==='basvuruac';await dependencies.configs.setCountryApplicationsOpen(interaction.guildId,open);await dependencies.countryPanels.syncCountryApplicationPanel(interaction.guildId);await dependencies.logs.info(interaction.guildId,`${interaction.user.tag} ülke başvurularını ${open?'açtı':'kapattı'}.`);await interaction.reply({content:open?'✅ Ülke başvuruları açıldı.':'⛔ Ülke başvuruları kapatıldı.',flags:MessageFlags.Ephemeral});return true;}
    const code=interaction.options.getString('ulke',true).toUpperCase();const country=getCountry(code);if(!country){await interaction.reply({content:'Geçersiz ülke.',flags:MessageFlags.Ephemeral});return true;}
    if(sub==='temsilcikaldir'){const current=dependencies.assignments.findActiveByCountry(interaction.guildId,code);if(!current){await interaction.reply({content:'Bu ülkenin aktif temsilcisi yok.',flags:MessageFlags.Ephemeral});return true;}const row=new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`${CUSTOM_IDS.countryRemovePrefix}${code}`).setLabel('Evet, Kaldır').setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId(CUSTOM_IDS.countryRemoveCancel).setLabel('Vazgeç').setStyle(ButtonStyle.Secondary));await interaction.reply({content:`${country.flag} ${country.nameTr} temsilcisi <@${current.discordUserId}> kaldırılsın mı?`,components:[row],flags:MessageFlags.Ephemeral});return true;}
    const user = interaction.options.getUser('kullanici', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const conflict = dependencies.assignments.findActiveByUser(interaction.guildId, user.id);
    if (conflict && conflict.countryCode !== code) {
      await interaction.editReply('Yeni kullanıcı zaten başka bir ülkeyi temsil ediyor.');
      return true;
    }
    let granted;
    let replaced;
    try {
      granted = await dependencies.countryRoles.grantCountryRole(interaction.guild, user.id, code);
      replaced = dependencies.assignments.replaceCountry(interaction.guildId, code, user.id, interaction.user.id);
    } catch (error) {
      if (granted?.roleAdded) {
        await dependencies.countryRoles.removeCountryRole(granted.member, granted.role).catch(() => undefined);
      }
      await interaction.editReply('Yeni rol/assignment tamamlanamadı; eski temsilci korundu.');
      return true;
    }
    const old = replaced.old;
    if (old && old.discordUserId !== user.id) {
      const member = await interaction.guild.members.fetch(old.discordUserId).catch(() => null);
      const role = await dependencies.countryRoles.getCountryRole(interaction.guild, code);
      if (member && role) {
        await dependencies.countryRoles.removeCountryRole(member, role).catch((error) =>
          dependencies.logs.error(interaction.guildId, 'Eski ülke rolü kaldırılamadı.', error),
        );
      }
    }
    let persistenceWarning = '';
    try {
      await dependencies.assignmentState.sync(interaction.guildId);
    } catch (error) {
      persistenceWarning = ' Ancak kalıcı temsilci yedeği güncellenemedi; logları kontrol edin.';
      await dependencies.logs.error(interaction.guildId, 'Temsilci değişikliği kalıcı data kanalına yazılamadı.', error);
    }
    await dependencies.countryPanels.syncAll(interaction.guildId);
    await dependencies.status.sync(interaction.guildId);
    await dependencies.logs.info(interaction.guildId, `${interaction.user.tag}, ${country.nameTr} temsilcisini <@${user.id}> olarak değiştirdi.`);
    await interaction.editReply(`✅ Temsilci değiştirildi.${persistenceWarning}`);
    return true;
  }
  if (interaction.isButton() && customId.startsWith(CUSTOM_IDS.countryRemovePrefix)) {
    const code = customId.slice(CUSTOM_IDS.countryRemovePrefix.length);
    const current = dependencies.assignments.findActiveByCountry(interaction.guildId, code);
    if (!current) {
      await interaction.update({ content: 'Aktif temsilci bulunamadı.', components: [] });
      return true;
    }
    const role = await dependencies.countryRoles.getCountryRole(interaction.guild, code);
    const member = await interaction.guild.members.fetch(current.discordUserId).catch(() => null);
    if (member && role) await dependencies.countryRoles.removeCountryRole(member, role);
    const removed = dependencies.assignments.deactivateCountry(interaction.guildId, code);
    let persistenceWarning = '';
    if (removed) {
      try {
        await dependencies.assignmentState.sync(interaction.guildId);
      } catch (error) {
        persistenceWarning = ' Ancak kalıcı temsilci yedeği güncellenemedi; logları kontrol edin.';
        await dependencies.logs.error(interaction.guildId, 'Temsilci silme işlemi kalıcı data kanalına yazılamadı.', error);
      }
    }
    await dependencies.countryPanels.syncAll(interaction.guildId);
    await dependencies.status.sync(interaction.guildId);
    if (removed) {
      await dependencies.logs.info(interaction.guildId, `${interaction.user.tag}, ${getCountry(code)?.nameTr ?? code} temsilcisini kaldırdı.`);
    }
    await interaction.update({
      content: removed ? `✅ Temsilci kaldırıldı.${persistenceWarning}` : 'Assignment değişmiş; işlem yapılmadı.',
      components: [],
    });
    return true;
  }
  if(interaction.isButton()&&customId===CUSTOM_IDS.countryRemoveCancel){await interaction.update({content:'İşlem iptal edildi.',components:[]});return true;}

  if (interaction.isChatInputCommand() && interaction.commandName === "hatirlat") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const type = interaction.options.getSubcommand() === "sarki" ? "songSubmission" : "voting";
    const summary = await dependencies.reminders.sendManual(interaction.guildId, type);
    await dependencies.logs.info(
      interaction.guildId,
      `${interaction.user.tag} manuel ${type === "songSubmission" ? "şarkı" : "oy"} hatırlatması gönderdi: ${summary.sent} başarılı, ${summary.failed} başarısız.`,
    );
    await interaction.editReply(
      `${summary.checked} kullanıcı kontrol edildi. ${summary.sent} hatırlatma gönderildi. ${summary.failed} kullanıcının DM'i kapalıydı veya gönderilemedi.`,
    );
    return true;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "oylama") {
    const open = interaction.options.getSubcommand() === "ac";
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await dependencies.configs.setVotingOpen(interaction.guildId, open);
    await dependencies.status.sync(interaction.guildId).catch((error) =>
      dependencies.logs.error(interaction.guildId, "Oylama durumu sonrası status paneli güncellenemedi.", error),
    );
    await dependencies.logs.info(interaction.guildId, `${interaction.user.tag} oylamayı ${open ? "açtı" : "kapattı"}.`);
    await interaction.editReply(open ? "✅ Oylama açıldı." : "⛔ Oylama kapatıldı.");
    return true;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "oykontrol") {
    const user = interaction.options.getUser("kullanici");
    if (user) {
      const ballot = dependencies.votes.findByUser(interaction.guildId, user.id);
      if (!ballot || ballot.status !== "SUBMITTED") {
        await interaction.reply({ content: "Bu kullanıcının gönderilmiş oy pusulası yok.", flags: MessageFlags.Ephemeral });
        return true;
      }
      const description = ballot.entries
        .sort((a, b) => b.points - a.points)
        .map((entry) => {
          const country = getCountry(entry.targetCountryCode);
          return `**${entry.points}** — ${country?.flag ?? "🌍"} ${country?.nameTr ?? entry.targetCountryCode}`;
        })
        .join("\n");
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle(`${user.tag} — Gizli Oy Pusulası`).setDescription(description).setColor(0xed4245)],
        flags: MessageFlags.Ephemeral,
      });
      await dependencies.logs.info(
        interaction.guildId,
        `Admin ${interaction.user.tag}, ${user.tag} kullanıcısının oy pusulasını görüntüledi.`,
      );
      return true;
    }

    const assignments = dependencies.assignments.listActive(interaction.guildId);
    const submitted = new Set(dependencies.votes.listSubmitted(interaction.guildId).map((ballot) => ballot.voterUserId));
    const complete: string[] = [];
    const missing: string[] = [];
    for (const assignment of assignments) {
      const country = getCountry(assignment.countryCode);
      const line = `${country?.flag ?? "🌍"} ${country?.nameTr ?? assignment.countryCode} — <@${assignment.discordUserId}>`;
      (submitted.has(assignment.discordUserId) ? complete : missing).push(`${line} ${submitted.has(assignment.discordUserId) ? "✅" : "❌"}`);
    }
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Oy Kontrol Paneli")
          .setDescription(`Oy: **${complete.length} / ${assignments.length}**`)
          .addFields(
            ...lineFields("Oy Verenler", complete, "Henüz yok."),
            ...lineFields("Oy Vermeyenler", missing, "Herkes oy verdi."),
          )
          .setColor(0x5865f2),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "oysifirla") {
    const user = interaction.options.getUser("kullanici", true);
    if (!dependencies.votes.findByUser(interaction.guildId, user.id)) {
      await interaction.reply({ content: "Bu kullanıcının sıfırlanabilecek pusulası yok.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${CUSTOM_IDS.voteResetPrefix}${user.id}`).setLabel("Evet, Sıfırla").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(CUSTOM_IDS.voteResetCancel).setLabel("Vazgeç").setStyle(ButtonStyle.Secondary),
    );
    await interaction.reply({ content: `⚠️ <@${user.id}> kullanıcısının oy pusulası kalıcı olarak sıfırlansın mı?`, components: [buttons], flags: MessageFlags.Ephemeral });
    return true;
  }

  if (interaction.isButton() && customId.startsWith(CUSTOM_IDS.voteResetPrefix)) {
    const userId = customId.slice(CUSTOM_IDS.voteResetPrefix.length);
    const removed = /^\d{17,20}$/.test(userId) && dependencies.votes.resetByUser(interaction.guildId, userId);
    if (removed) {
      await dependencies.logs.info(interaction.guildId, `${interaction.user.tag}, <@${userId}> kullanıcısının oy pusulasını sıfırladı.`);
      await dependencies.status.sync(interaction.guildId).catch(() => undefined);
    }
    await interaction.update({ content: removed ? "✅ Oy pusulası sıfırlandı." : "Pusula bulunamadı veya zaten sıfırlanmış.", components: [] });
    return true;
  }

  if (interaction.isButton() && customId === CUSTOM_IDS.voteResetCancel) {
    await interaction.update({ content: "Oy sıfırlama işlemi iptal edildi.", components: [] });
    return true;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "sarkikilidi") {
    const rawCountry = interaction.options.getString("ulke", true);
    const country = getCountry(rawCountry.toUpperCase()) ?? EUROVISION_COUNTRIES.find(
      (item) => item.nameTr.toLocaleLowerCase("tr") === rawCountry.toLocaleLowerCase("tr"),
    );
    if (!country) {
      await interaction.reply({ content: "Geçersiz ülke.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const locked = interaction.options.getString("durum", true) === "kilitli";
    const submission = dependencies.submissions.setLock(interaction.guildId, country.code, locked);
    if (!submission) {
      await interaction.reply({ content: `${country.flag} ${country.nameTr} için onaylanmış resmi şarkı yok.`, flags: MessageFlags.Ephemeral });
      return true;
    }
    await dependencies.logs.info(
      interaction.guildId,
      `${interaction.user.tag}, ${country.nameTr} resmi şarkı kilidini ${locked ? "kapattı" : "açtı"}.`,
    );
    await dependencies.status.sync(interaction.guildId).catch(() => undefined);
    await interaction.reply({
      content: `${country.flag} ${country.nameTr} resmi şarkısı ${locked ? "kilitlendi" : "yeni başvuruya açıldı"}.`,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  return true;
}
