require('dotenv').config();
const {
  Client, GatewayIntentBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits, Events,
} = require('discord.js');
const http = require('http');
const { parseRaidhelperEmbed, isRaidhelperMessage } = require('./raidhelper-parser');
const { syncSignupsToSheet, buildDiscordPayload }   = require('./sheet-sync');

// ── Render braucht einen offenen Port ────────────────────────────
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Raid Sync Bot läuft\n');
});
server.listen(process.env.PORT || 3000, () => {
  console.log(`HTTP Server läuft auf Port ${process.env.PORT || 3000}`);
});

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

const syncCooldowns = new Map();
const COOLDOWN_MS   = 60 * 1000;

function hasPermission(member) {
  return member.roles.cache.some(r => r.name === LC_ROLE_NAME) ||
    member.permissions.has(PermissionFlagsBits.Administrator);
}

async function performSync(message, source = 'auto') {
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
    if (!parsed || parsed.signups.length === 0) {
      console.log(`[Sync] Keine Signups in ${eventId}`);
      return;
    }
    console.log(`[Sync] ${parsed.signups.length} Signups aus "${parsed.title}" (${source})`);
    const { groups, updated, added } = await syncSignupsToSheet(
      parsed.signups, parsed.title, eventId
    );
    console.log(`[Sync] Fertig – ${updated} aktualisiert, ${added} neu`);
    if (WEBHOOK_URL) {
      const payload = buildDiscordPayload(groups, parsed.title, parsed.signups.length, 0);
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      console.log(`[Discord] Post in #raidsheet gesendet`);
    }
  } catch (err) {
    console.error(`[Sync] Fehler:`, err.message);
  }
}

client.on(Events.MessageCreate, async message => {
  if (!isRaidhelperMessage(message)) return;
  console.log(`[Bot] Raidhelper-Event in #${message.channel.name}`);
  setTimeout(() => performSync(message, 'new event'), 3000);
});

client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
  if (!isRaidhelperMessage(newMsg)) return;
  console.log(`[Bot] Raidhelper-Update: ${newMsg.id}`);
  setTimeout(() => performSync(newMsg, 'update'), 2000);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

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
      if (!isRaidhelperMessage(message)) {
        return interaction.editReply('❌ Kein Raidhelper-Event.');
      }
      const parsed = parseRaidhelperEmbed(message);
      if (!parsed?.signups.length) {
        return interaction.editReply('❌ Keine Signups gefunden.');
      }
      const { groups, updated, added } = await syncSignupsToSheet(
        parsed.signups, parsed.title, message.id
      );
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
          { name: 'Event',           value: parsed.title,              inline: true },
          { name: 'Spieler',         value: `${parsed.signups.length}`, inline: true },
          { name: 'Aktualisiert',    value: `${updated}`,              inline: true },
          { name: 'Neu',             value: `${added}`,                inline: true },
        ).setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply(`❌ Fehler: ${err.message}`);
    }
    return;
  }

  if (interaction.commandName === 'scan-channel') {
    if (!hasPermission(interaction.member)) {
      return interaction.reply({ content: `❌ Du brauchst die Rolle **${LC_ROLE_NAME}**.`, ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const messages = await interaction.channel.messages.fetch({ limit: 50 });
      const rhMsgs   = messages.filter(m => isRaidhelperMessage(m));
      if (!rhMsgs.size) {
        return interaction.editReply('ℹ️ Keine Raidhelper-Events gefunden (letzte 50 Nachrichten).');
      }
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
      await interaction.editReply({
        content: `${rhMsgs.size} Event(s) gefunden. Welches soll gesynct werden?`,
        components: [row],
      });
    } catch (err) {
      await interaction.editReply(`❌ Fehler: ${err.message}`);
    }
    return;
  }

  if (interaction.commandName === 'roster-status') {
    try {
      const { getRosterData } = require('./sheet-sync');
      const data  = await getRosterData();
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
      await interaction.reply({ content: `❌ Fehler: ${err.message}`, ephemeral: true });
    }
    return;
  }
});

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
