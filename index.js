require('dotenv').config();
const {
  Client, GatewayIntentBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits, Events,
} = require('discord.js');
const { parseRaidhelperEmbed, isRaidhelperMessage } = require('./raidhelper-parser');
const { syncSignupsToSheet, buildDiscordPayload }   = require('./sheet-sync');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

const LC_ROLE_NAME = process.env.LC_ROLE_NAME || 'Raid-Leader';
const WEBHOOK_URL  = process.env.WEBHOOK_URL;

// Verhindert doppelte Syncs für dasselbe Event innerhalb kurzer Zeit
const syncCooldowns = new Map(); // eventId → timestamp
const COOLDOWN_MS   = 60 * 1000; // 60 Sekunden zwischen Syncs pro Event

function hasPermission(member) {
  return member.roles.cache.some(r => r.name === LC_ROLE_NAME) ||
    member.permissions.has(PermissionFlagsBits.Administrator);
}

// ── Haupt-Sync Funktion ───────────────────────────────────────────
async function performSync(message, source = 'auto') {
  const eventId = message.id;

  // Cooldown prüfen
  const lastSync = syncCooldowns.get(eventId);
  if (lastSync && Date.now() - lastSync < COOLDOWN_MS) {
    console.log(`[Sync] Cooldown aktiv für Event ${eventId} – übersprungen`);
    return;
  }
  syncCooldowns.set(eventId, Date.now());

  try {
    // Neueste Version der Nachricht holen (mit aktuellen Signups)
    const freshMsg = await message.fetch().catch(() => message);
    const parsed   = parseRaidhelperEmbed(freshMsg);

    if (!parsed || parsed.signups.length === 0) {
      console.log(`[Sync] Keine Signups gefunden in Message ${eventId}`);
      return;
    }

    console.log(`[Sync] ${parsed.signups.length} Signups aus "${parsed.title}" (${source})`);

    // Sheet aktualisieren
    const { groups, updated, added } = await syncSignupsToSheet(
      parsed.signups,
      parsed.title,
      eventId
    );

    const ignored = 0; // Alle aus dem Embed sind bereits gefiltert
    console.log(`[Sync] Fertig – ${updated} aktualisiert, ${added} neu`);

    // Discord Post → #raidsheet
    if (WEBHOOK_URL) {
      const payload = buildDiscordPayload(groups, parsed.title, parsed.signups.length, ignored);
      await fetch(WEBHOOK_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      console.log(`[Discord] Post in #raidsheet gesendet`);
    }

  } catch (err) {
    console.error(`[Sync] Fehler:`, err.message);
  }
}

// ── Event: Neue Nachricht ─────────────────────────────────────────
client.on(Events.MessageCreate, async message => {
  if (!isRaidhelperMessage(message)) return;
  console.log(`[Bot] Raidhelper-Event erkannt in #${message.channel.name}: "${message.embeds[0]?.title || message.id}"`);
  // Kurz warten damit das Embed vollständig geladen ist
  setTimeout(() => performSync(message, 'new event'), 3000);
});

// ── Event: Nachricht bearbeitet (Signup/Absage) ───────────────────
client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
  if (!isRaidhelperMessage(newMsg)) return;
  console.log(`[Bot] Raidhelper-Event aktualisiert: ${newMsg.id}`);
  setTimeout(() => performSync(newMsg, 'update'), 2000);
});

// ── Slash Commands ────────────────────────────────────────────────
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // /sync-raid – manueller Sync eines bestimmten Events
  if (interaction.commandName === 'sync-raid') {
    if (!hasPermission(interaction.member)) {
      return interaction.reply({ content: `❌ Du brauchst die Rolle **${LC_ROLE_NAME}**.`, ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: false });

    const messageId = interaction.options.getString('message_id');
    const channelId = interaction.options.getString('channel_id') || interaction.channelId;

    try {
      const channel = await client.channels.fetch(channelId);
      const message = await channel.messages.fetch(messageId);

      if (!isRaidhelperMessage(message)) {
        return interaction.editReply('❌ Diese Nachricht ist kein Raidhelper-Event.');
      }

      const parsed = parseRaidhelperEmbed(message);
      if (!parsed || !parsed.signups.length) {
        return interaction.editReply('❌ Keine Signups in diesem Event gefunden.');
      }

      const { groups, updated, added } = await syncSignupsToSheet(
        parsed.signups, parsed.title, message.id
      );

      // Discord Post
      if (WEBHOOK_URL) {
        const payload = buildDiscordPayload(groups, parsed.title, parsed.signups.length, 0);
        await fetch(WEBHOOK_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x1D9E75)
        .setTitle('✅ Sync abgeschlossen')
        .addFields(
          { name: 'Event',          value: parsed.title,         inline: true },
          { name: 'Spieler',        value: `${parsed.signups.length}`, inline: true },
          { name: 'Aktualisiert',   value: `${updated}`,         inline: true },
          { name: 'Neu hinzugefügt',value: `${added}`,           inline: true },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      await interaction.editReply(`❌ Fehler: ${err.message}`);
    }
    return;
  }

  // /scan-channel – scannt Channel nach Raidhelper-Posts
  if (interaction.commandName === 'scan-channel') {
    if (!hasPermission(interaction.member)) {
      return interaction.reply({ content: `❌ Du brauchst die Rolle **${LC_ROLE_NAME}**.`, ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const channel  = interaction.channel;
      const messages = await channel.messages.fetch({ limit: 50 });
      const rhMsgs   = messages.filter(m => isRaidhelperMessage(m));

      if (!rhMsgs.size) {
        return interaction.editReply('ℹ️ Keine Raidhelper-Events in diesem Channel gefunden (letzte 50 Nachrichten).');
      }

      const options = rhMsgs.map(m => ({
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

      await interaction.editReply({
        content: `${rhMsgs.size} Raidhelper-Event(s) gefunden. Welches soll gesynct werden?`,
        components: [row],
      });

    } catch (err) {
      await interaction.editReply(`❌ Fehler: ${err.message}`);
    }
    return;
  }

  // /roster-status – zeigt aktuellen Roster
  if (interaction.commandName === 'roster-status') {
    try {
      const { getRosterData } = require('./sheet-sync');
      const data = await getRosterData();

      const lines = data
        .filter(row => row[1])
        .map((row, i) => `\`${String(i+1).padStart(2)}\` **${row[1]}** ${row[2]||'?'} ${row[3]?`(${row[3]})`:''}  —  ${row[4]||'?'}  |  ${row[6]||'0%'}`);

      const embed = new EmbedBuilder()
        .setColor(0x0F3460)
        .setTitle('📋 Aktueller Roster')
        .setDescription(lines.join('\n') || '*(leer)*')
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch(err) {
      await interaction.reply({ content: `❌ Sheet-Fehler: ${err.message}`, ephemeral: true });
    }
    return;
  }
});

// ── Select Menu für scan-channel ─────────────────────────────────
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== 'select_event') return;

  await interaction.deferUpdate();
  const messageId = interaction.values[0];

  try {
    const message = await interaction.channel.messages.fetch(messageId);
    await performSync(message, 'manual select');
    await interaction.editReply({ content: `✅ Sync für Event \`${messageId}\` gestartet.`, components: [] });
  } catch(err) {
    await interaction.editReply({ content: `❌ Fehler: ${err.message}`, components: [] });
  }
});

client.on(Events.ClientReady, () => {
  console.log(`✅ Raid Sync Bot online als ${client.user.tag}`);
  console.log(`   Überwacht alle Channels auf Raidhelper-Events`);
  console.log(`   Sheet: ${process.env.GOOGLE_SHEET_ID}`);
});

client.login(process.env.DISCORD_TOKEN);
