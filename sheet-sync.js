// sheet-sync.js - Ohne Attendance und Main/Alt

const { google } = require('googleapis');

const ROSTER_RANGE = 'Roster!A3:F27';
const STATUS_CELL  = 'Roster!A1';

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
  const sheets   = getSheets();
  const sheetId  = process.env.GOOGLE_SHEET_ID;
  const existing = await getRosterData();

  // Name → Zeilen-Index
  const nameMap = {};
  existing.forEach((row, i) => {
    if (row[1]) nameMap[row[1].toString().toLowerCase()] = i;
  });

  // Letztes Event-ID prüfen (kein Doppel-Sync)
  let lastEventId = '';
  try {
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId, range: 'Roster!H2',
    });
    lastEventId = ((r.data.values || [['']])[0][0] || '').toString();
  } catch(e) {}

  const groups  = { 'Tank':[], 'Heal':[], 'Melee DPS':[], 'Ranged DPS':[], 'Sonstige':[] };
  let updated = 0, added = 0;

  for (const s of signups) {
    const name  = s.name || '';
    if (!name) continue;
    const klass = s.class || '';
    const spec  = s.spec  || '';
    const role  = s.role  || '';
    const key   = name.toLowerCase();

    if (nameMap[key] !== undefined) {
      const row = existing[nameMap[key]];
      if (klass) row[2] = klass;
      if (spec)  row[3] = spec;
      if (role)  row[4] = role;
      updated++;
    } else {
      const empty = existing.findIndex(r => !r[1]);
      const idx   = empty !== -1 ? empty : existing.length;
      if (idx < 25) {
        existing[idx] = [idx + 1, name, klass, spec, role, ''];
        nameMap[key]  = idx;
        added++;
      }
    }

    const grp = groups[role] !== undefined ? role : 'Sonstige';
    groups[grp].push(name);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId:    sheetId,
    range:            ROSTER_RANGE,
    valueInputOption: 'USER_ENTERED',
    requestBody:      { values: existing },
  });

  // Status + letzte Event-ID
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: STATUS_CELL,  values: [[`✅ Sync: ${new Date().toLocaleString('de-DE')}  |  ${eventTitle || eventId}  |  ${signups.length} Spieler`]] },
        { range: 'Roster!H2', values: [[eventId || '']] },
      ],
    },
  });

  return { groups, updated, added };
}

function buildDiscordPayload(groups, eventTitle, signupCount, ignored) {
  const ROLE_ICONS = { 'Tank':'🛡️', 'Heal':'💚', 'Melee DPS':'⚔️', 'Ranged DPS':'🏹' };
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
      description: `**${eventTitle || 'Raid'}**  ·  ${signupCount} Spieler`,
      color:       0x1A4A6B,
      fields,
      footer: { text: `Sync: ${new Date().toLocaleString('de-DE')}` },
    }],
  };
}

module.exports = { syncSignupsToSheet, buildDiscordPayload, getRosterData };
