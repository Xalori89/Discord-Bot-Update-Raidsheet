require('dotenv').config();
const {
  Client, GatewayIntentBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits, Events,
} = require('discord.js');
const http = require('http');
const { parseRaidhelperEmbed, isRaidhelperMessage } = require('./raidhelper-parser');
const { syncSignupsToSheet, buildDiscordPayload }   = require('./sheet-sync');

// ── HTTP Server für Render ────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.writeHead(200); res.end('OK');
});
server.listen(process.env.PORT || 3000);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

const LC_ROLE_NAME       = process.env.LC_ROLE_NAME       || 'Raid-Leader';
const WEBHOOK_URL        = process.env.WEBHOOK_URL;
const RAIDSHEET_CHANNEL  = process.env.RAIDSHEET_CHANNEL_ID;
const SHEET_URL          = `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit`;
const FOX_ROLE_ID        = process.env.FOX_ROLE_ID; // @F O X - Mitglieder Role ID

// Cooldown pro Event (Sheet-Update)
const syncCooldowns = new Map();
const COOLDOWN_MS   = 30 * 1000; // 30 Sekunden

// Letzter Discord-Post pro Event (verhindert Doppelposts)
const lastPostTime = new Map();

function hasPermission(member) {
  return member.roles.cache.some(r => r.name === LC_ROLE_NAME) ||
    member.permissions.has(PermissionFlagsBits.Administrator);
}

// ── Prüfen ob jetzt Posting-Zeit ist (Di/So 18:00 Uhr Berlin) ────
function isPostingTime() {
  const now    = new Date();
  const berlin = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  const day    = berlin.getDay();  // 0=So, 2=Di
  const hour   = berlin.getHours();
  const min    = berlin.getMinutes();
  // Dienstag (2) oder Sonntag (0), zwischen 18:00 und 18:05
  return (day === 2 || day === 0) && hour === 18 && min < 5;
}

// ── Discord Post in #raidsheet ────────────────────────────────────
async function postToRaidsheet(groups, eventTitle, signupCount) {
  if (!WEBHOOK_URL) return;

  const foxPing = FOX_ROLE_ID ? `<@&${FOX_ROLE_ID}>` : '@F O X - Mitglieder';
  const fields  = [];
  const ROLE_ICONS = { 'Tank':'🛡️', 'Heal':'💚', 'Melee DPS':'⚔️', 'Ranged DPS':'🏹' };

  for (const [role, players] of Object.entries(groups)) {
    if (!players.length) continue;
    fields.push({
      name:   `${ROLE_ICONS[role] || '❓'} ${role} [${players.length}]`,
      value:  players.join(' · '),
      inline: true,
    });
  }

  await fetch(WEBHOOK_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content:  `${foxPing}\n📋 **Raid Roster wurde aktualisiert** – schaut euch eure Aufgaben im Sheet an!`,
      username: 'RaidSheet Sync',
      embeds: [{
        title:       `⚔️  Raid Roster — ${eventTitle}`,
        description: `**${signupCount} Spieler** sind für diesen Raid angemeldet.\n\n🔗 [**Raidsheet öffnen**](${SHEET_URL})`,
        color:       0x1A4A6B,
        fields,
        footer: { text: `Aktualisiert: ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}` },
      }],
    }),
  });
  console.log(`[Discord] Post in #raidsheet gesendet mit ${foxPing} Ping`);
}

// ── Haupt-Sync (Sheet still aktualisieren) ────────────────────────
async function performSync(message, source = 'auto', forcePost = false) {
  const eventId = message.id;
  const lastSync = syncCooldowns.get(eventId);
  if (lastSync && Date.now() - lastSync < COOLDOWN_MS) {
    console.log(`[Sync] Cooldown aktiv für ${eventId}`);
    return;
  }
  syncCooldowns.set(eventId, Date.now());

  try {
    const freshMsg = await message.fetch().catch(() => message);
    const parsed   = parseRaidhelperEmbed(freshMsg);
    if (!parsed?.signups.length) {
      console.log(`[Sync] Keine Signups in ${eventId}`);
      return;
    }

    console.log(`[Sync] ${parsed.signups.length} Spieler (${source})`);
    const { groups, updated, added } = await syncSignupsToSheet(
      parsed.signups, parsed.title, eventId
    );
    console.log(`[Sync] Sheet: ${updated} aktualisiert, ${added} neu`);

    // Discord-Post nur Di/So 18:00 oder wenn manuell erzwungen
    if (forcePost || isPostingTime()) {
      const lastPost = lastPostTime.get(eventId) || 0;
      if (forcePost || Date.now() - lastPost > 60 * 60 * 1000) { // max 1x pro Stunde
        await postToRaidsheet(groups, parsed.title, parsed.signups.length);
        lastPostTime.set(eventId, Date.now());
      }
    } else {
      console.log(`[Sync] Sheet aktualisiert – kein Discord-Post (nicht Di/So 18:00)`);
    }

  } catch (err) {
    console.error(`[Sync] Fehler:`, err.message);
  }
}

// ── Scheduled Check: jede Minute prüfen ob Posting-Zeit ──────────
let scheduledEventId = null;
setInterval(async () => {
  if (!isPostingTime() || !scheduledEventId) return;
  const lastPost = lastPostTime.get(scheduledEventId) || 0;
  if (Date.now() - lastPost < 60 * 60 * 1000) return; // schon gepostet
  console.log('[Scheduler] Posting-Zeit! Aktuelles Event wird gepostet...');
  // Neueste Daten aus Sheet holen und posten
  try {
    const { getRosterData } = require('./sheet-sync');
    const data   = await getRosterData();
    const ROLE_ICONS = { 'Tank':'🛡️', 'Heal':'💚', 'Melee DPS':'⚔️', 'Ranged DPS':'🏹' };
    const groups = { 'Tank':[], 'Heal':[], 'Melee DPS':[], 'Ranged DPS':[], 'Sonstige':[] };
    data.filter(r => r[1]).forEach(r => {
      const role = r[4] || 'Sonstige';
      if (groups[role]) groups[role].push(r[1]);
      else groups['Sonstige'].push(r[1]);
    });
    const total = data.filter(r => r[1]).length;
    await postToRaidsheet(groups, 'SSC / TK', total);
    lastPostTime.set(scheduledEventId, Date.now());
  } catch(e) {
    console.error('[Scheduler] Fehler:', e.message);
  }
}, 60 * 1000);

// ── Event: Neue Nachricht ─────────────────────────────────────────
client.on(Events.MessageCreate, async message => {
  if (!isRaidhelperMessage(message)) return;
  console.log(`[Bot] Raidhelper-Event erkannt: "${message.embeds[0]?.title}"`);
  scheduledEventId = message.id;
  setTimeout(() => performSync(message, 'new event'), 3000);
});

// ── Event: Update (Anmeldung/Abmeldung) ──────────────────────────
client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
  if (!isRaidhelperMessage(newMsg)) return;
  scheduledEventId = newMsg.id;
  setTimeout(() => performSync(newMsg, 'signup update'), 2000);
});

// ── Slash Commands ────────────────────────────────────────────────
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // /sync-raid – manueller Sync + sofortiger Post
  if (interaction.commandName === 'sync-raid') {
    if (!hasPermission(interaction.member)) {
      return interaction.reply({ content: `❌ Du brauchst die Rolle **${LC_ROLE_NAME}**.`, ephemeral: true });
    }
    await interaction.deferReply();
    const messageId = interaction.options.getString('message_id');
    const channelId = interaction.options.getString('channel_id') || interaction.channelId;
    try {
      const channel = await client.channels.fetch(channelId);
      const message = await channel.messages.fetch(messageId);
      if (!isRaidhelperMessage(message)) return interaction.editReply('❌ Kein Raidhelper-Event.');
      scheduledEventId = messageId;
      await performSync(message, 'manual', true); // forcePost = true
      const embed = new EmbedBuilder()
        .setColor(0x1D9E75)
        .setTitle('✅ Sync + Post abgeschlossen')
        .setDescription(`Sheet aktualisiert und Post in #raidsheet gesendet.\n🔗 [Sheet öffnen](${SHEET_URL})`)
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply(`❌ Fehler: ${err.message}`);
    }
    return;
  }

  // /scan-channel
  if (interaction.commandName === 'scan-channel') {
    if (!hasPermission(interaction.member)) {
      return interaction.reply({ content: `❌ Du brauchst die Rolle **${LC_ROLE_NAME}**.`, ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const messages = await interaction.channel.messages.fetch({ limit: 50 });
      const rhMsgs   = messages.filter(m => isRaidhelperMessage(m));
      if (!rhMsgs.size) return interaction.editReply('ℹ️ Keine Raidhelper-Events gefunden.');
      const options = [...rhMsgs.values()].map(m => ({
        label:       (m.embeds[0]?.title || 'Raid Event').substring(0, 100),
        description: `ID: ${m.id}`,
        value:       m.id,
      })).slice(0, 25);
      const { StringSelectMenuBuilder } = require('discord.js');
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_event')
          .setPlaceholder('Event auswählen...')
          .addOptions(options)
      );
      await interaction.editReply({ content: `${rhMsgs.size} Event(s) gefunden:`, components: [row] });
    } catch (err) {
      await interaction.editReply(`❌ Fehler: ${err.message}`);
    }
    return;
  }

  // /post-roster – manuell sofort posten
  if (interaction.commandName === 'post-roster') {
    if (!hasPermission(interaction.member)) {
      return interaction.reply({ content: `❌ Du brauchst die Rolle **${LC_ROLE_NAME}**.`, ephemeral: true });
    }
    await interaction.deferReply();
    try {
      const { getRosterData } = require('./sheet-sync');
      const data   = await getRosterData();
      const groups = { 'Tank':[], 'Heal':[], 'Melee DPS':[], 'Ranged DPS':[], 'Sonstige':[] };
      data.filter(r => r[1]).forEach(r => {
        const role = r[4] || 'Sonstige';
        if (groups[role]) groups[role].push(r[1]);
        else groups['Sonstige'].push(r[1]);
      });
      const total = data.filter(r => r[1]).length;
      await postToRaidsheet(groups, 'SSC / TK', total);
      await interaction.editReply(`✅ Roster mit @F O X - Mitglieder Ping in #raidsheet gepostet!`);
    } catch(err) {
      await interaction.editReply(`❌ Fehler: ${err.message}`);
    }
    return;
  }

  // /roster-status
  if (interaction.commandName === 'roster-status') {
    try {
      const { getRosterData } = require('./sheet-sync');
      const data  = await getRosterData();
      const lines = data.filter(r => r[1])
        .map((r, i) => `\`${String(i+1).padStart(2)}\` **${r[1]}** ${r[2]||'?'} — ${r[4]||'?'} | ${r[6]||'0%'}`);
      const embed = new EmbedBuilder()
        .setColor(0x0F3460)
        .setTitle('📋 Aktueller Roster')
        .setDescription(lines.join('\n') || '*(leer)*')
        .setFooter({ text: `🔗 ${SHEET_URL}` })
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch(err) {
      await interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
    }
    return;
  }
});

// ── Select Menu ───────────────────────────────────────────────────
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isStringSelectMenu() || interaction.customId !== 'select_event') return;
  await interaction.deferUpdate();
  const messageId = interaction.values[0];
  try {
    const message = await interaction.channel.messages.fetch(messageId);
    scheduledEventId = messageId;
    await performSync(message, 'manual select', false);
    await interaction.editReply({
      content: `✅ Sheet aktualisiert. Nutze **/post-roster** um jetzt sofort zu posten.`,
      components: [],
    });
  } catch(err) {
    await interaction.editReply({ content: `❌ ${err.message}`, components: [] });
  }
});

client.on(Events.ClientReady, () => {
  console.log(`✅ Raid Sync Bot online als ${client.user.tag}`);
  console.log(`   Sheet: ${SHEET_URL}`);
  console.log(`   Auto-Post: Dienstag + Sonntag 18:00 Uhr (Berlin)`);
});

client.login(process.env.DISCORD_TOKEN);
