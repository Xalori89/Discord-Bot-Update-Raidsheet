// sheet-sync.js
// Schreibt Raid-Signups direkt in das Google Sheet

const { google } = require('googleapis');

const ROSTER_RANGE = '📋 Roster!A3:H27';
const STATUS_CELL  = '📋 Roster!A1';

const CLASS_DE = {
  warrior:'Krieger',   paladin:'Paladin',      hunter:'Jäger',
  rogue:'Schurke',     priest:'Priester',      shaman:'Schamane',
  mage:'Magier',       warlock:'Hexenmeister', druid:'Druide',
  deathknight:'Todesritter',
  // Deutsch direkt
  krieger:'Krieger',   hexenmeister:'Hexenmeister', jäger:'Jäger',
  schurke:'Schurke',   priester:'Priester',          schamane:'Schamane',
  magier:'Magier',     druide:'Druide',              todesritter:'Todesritter',
};

const ROLE_DE = {
  tank:'Tank',         tanks:'Tank',
  heal:'Heal',         healer:'Heal',    heals:'Heal',
  melee:'Melee DPS',   'melee dps':'Melee DPS',
  ranged:'Ranged DPS', 'ranged dps':'Ranged DPS',
  dps:'Ranged DPS',
};

const ROLE_ICONS = {
  'Tank':'🛡️', 'Heal':'💚', 'Melee DPS':'⚔️', 'Ranged DPS':'🏹'
};

function getSheets() {
  const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  const auth  = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function getRosterData() {
  const sheets = getSheets();
  const res    = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range:         ROSTER_RANGE,
  });
  return res.data.values || [];
}

async function syncSignupsToSheet(signups, eventTitle, eventId) {
  const sheets     = getSheets();
  const sheetId    = process.env.GOOGLE_SHEET_ID;
  const existing   = await getRosterData();

  // Name → Zeilen-Index Mapping
  const nameMap = {};
  existing.forEach((row, i) => {
    if (row[1]) nameMap[row[1].toString().toLowerCase()] = i;
  });

  // Attendance-Counter aus Sheet lesen
  let totalRaids = 0;
  try {
    const metaRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: '📋 Roster!J1',
    });
    totalRaids = parseInt((metaRes.data.values || [[0]])[0][0]) || 0;
  } catch(e) { totalRaids = 0; }

  // Nur einmal pro Event-ID zählen
  let lastEventId = '';
  try {
    const lastRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: '📋 Roster!J2',
    });
    lastEventId = ((lastRes.data.values || [['']])[0][0] || '').toString();
  } catch(e) {}

  const isNewEvent = eventId && eventId.toString() !== lastEventId;
  if (isNewEvent) totalRaids++;

  const groups  = { 'Tank':[], 'Heal':[], 'Melee DPS':[], 'Ranged DPS':[], 'Sonstige':[] };
  let updated = 0, added = 0;

  for (const s of signups) {
    const name  = s.name || '';
    if (!name) continue;
    const klass = CLASS_DE[s.class?.toLowerCase()] || s.class || '';
    const spec  = s.spec  || '';
    const role  = ROLE_DE[s.role?.toLowerCase()] || s.role || '';
    const key   = name.toLowerCase();

    if (nameMap[key] !== undefined) {
      const row = existing[nameMap[key]];
      if (klass) row[2] = klass;
      if (spec)  row[3] = spec;
      if (role)  row[4] = role;
      if (!row[5]) row[5] = 'Main';
      // Attendance
      const prev = row[6] ? parseFloat(row[6]) / 100 * (totalRaids - 1) : 0;
      row[6] = Math.round(((prev + 1) / totalRaids) * 100) + '%';
      updated++;
    } else {
      // Neue Zeile finden
      const emptyIdx = existing.findIndex(r => !r[1]);
      const insertAt = emptyIdx !== -1 ? emptyIdx : existing.length;
      if (insertAt < 25) {
        existing[insertAt] = [
          insertAt + 1, name, klass, spec, role, 'Main',
          Math.round((1 / totalRaids) * 100) + '%', '',
        ];
        nameMap[key] = insertAt;
        added++;
      }
    }

    const grp = groups[role] !== undefined ? role : 'Sonstige';
    groups[grp].push(name);
  }

  // Sheet schreiben
  await sheets.spreadsheets.values.update({
    spreadsheetId:     sheetId,
    range:             ROSTER_RANGE,
    valueInputOption:  'USER_ENTERED',
    requestBody:       { values: existing },
  });

  // Status-Zeile + Event-ID speichern
  const statusText = `✅ Sync: ${new Date().toLocaleString('de-DE')}  |  ${eventTitle || eventId}  |  ${signups.length} Spieler`;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: STATUS_CELL,     values: [[statusText]]    },
        { range: '📋 Roster!J1', values: [[totalRaids]]    },
        { range: '📋 Roster!J2', values: [[eventId || '']] },
      ],
    },
  });

  return { groups, updated, added, totalRaids };
}

function buildDiscordPayload(groups, eventTitle, signupCount, ignored) {
  const fields = [];
  for (const [role, players] of Object.entries(groups)) {
    if (!players.length) continue;
    fields.push({
      name:   `${ROLE_ICONS[role] || '❓'} ${role} [${players.length}]`,
      value:  players.join(' · '),
      inline: true,
    });
  }
  return {
    username: 'RaidSheet Sync',
    embeds: [{
      title:       '⚔️  Raid Roster — SSC / TK',
      description: `**${eventTitle || 'Raid'}**  ·  ${signupCount} Spieler  ·  ${ignored} ignoriert`,
      color:       0x1A4A6B,
      fields,
      footer: { text: `Sync: ${new Date().toLocaleString('de-DE')}` },
    }],
  };
}

module.exports = { syncSignupsToSheet, buildDiscordPayload, CLASS_DE, ROLE_DE };
