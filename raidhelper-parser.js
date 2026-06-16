// raidhelper-parser.js - Final Version mit korrekter Spieler-Trennung

const CLASS_MAP = {
  'tank':'Tank', 'warrior':'Krieger', 'paladin':'Paladin',
  'hunter':'Jäger', 'rogue':'Schurke', 'priest':'Priester',
  'shaman':'Schamane', 'mage':'Magier', 'warlock':'Hexenmeister',
  'druid':'Druide', 'deathknight':'Todesritter',
  'krieger':'Krieger', 'jäger':'Jäger', 'schurke':'Schurke',
  'priester':'Priester', 'schamane':'Schamane', 'magier':'Magier',
  'hexenmeister':'Hexenmeister', 'druide':'Druide', 'todesritter':'Todesritter',
};

const ROLE_MAP = {
  'tank':'Tank',         'tanks':'Tank',
  'warrior':'Melee DPS', 'krieger':'Melee DPS',
  'paladin':'Heal',
  'hunter':'Ranged DPS', 'jäger':'Ranged DPS',
  'rogue':'Melee DPS',   'schurke':'Melee DPS',
  'priest':'Heal',       'priester':'Heal',
  'shaman':'Heal',       'schamane':'Heal',
  'mage':'Ranged DPS',   'magier':'Ranged DPS',
  'warlock':'Ranged DPS','hexenmeister':'Ranged DPS',
  'druid':'Ranged DPS',  'druide':'Ranged DPS',
  'healer':'Heal',       'healers':'Heal',
  'ranged':'Ranged DPS', 'melee':'Melee DPS',
};

const EMOJI_CLASS_MAP = {
  'warrior':'Krieger', 'paladin':'Paladin', 'hunter':'Jäger',
  'rogue':'Schurke', 'priest':'Priester', 'shaman':'Schamane',
  'mage':'Magier', 'warlock':'Hexenmeister', 'druid':'Druide',
  'deathknight':'Todesritter', 'dk':'Todesritter',
};

const EMOJI_ROLE_MAP = {
  'protection':'Tank', 'prot':'Tank',
  'holy':'Heal', 'resto':'Heal', 'restoration':'Heal',
  'discipline':'Heal', 'disc':'Heal',
  'shadow':'Ranged DPS', 'balance':'Ranged DPS', 'elemental':'Ranged DPS',
  'enhancement':'Melee DPS', 'enh':'Melee DPS',
  'feral':'Melee DPS', 'fury':'Melee DPS', 'arms':'Melee DPS',
  'combat':'Melee DPS', 'assassination':'Melee DPS', 'subtlety':'Melee DPS',
  'marksmanship':'Ranged DPS', 'beastmastery':'Ranged DPS', 'survival':'Ranged DPS',
  'fire':'Ranged DPS', 'frost':'Ranged DPS', 'arcane':'Ranged DPS',
  'affliction':'Ranged DPS', 'destruction':'Ranged DPS', 'demonology':'Ranged DPS',
  'retribution':'Melee DPS', 'ret':'Melee DPS', 'unholy':'Melee DPS',
};

function stripMarkdown(text) {
  return text
    .replace(/\*\*/g, '').replace(/\*/g, '')
    .replace(/__/g, '').replace(/_/g, '')
    .replace(/`/g, '').trim();
}

function stripDiscordEmojis(text) {
  return text.replace(/<a?:[a-zA-Z0-9_]+:\d+>/g, '').trim();
}

function stripAll(text) {
  let s = text;
  s = s.replace(/<a?:[a-zA-Z0-9_]+:\d+>/g, '');
  s = s.replace(/<@!?\d+>/g, '');
  s = s.replace(/<#\d+>/g, '');
  s = s.replace(/\*\*/g, '').replace(/\*/g, '');
  s = s.replace(/__/g, '').replace(/_(?=[^_])/g, '');
  s = s.replace(/`/g, '');
  s = s.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
  s = s.replace(/[✅✔☑✓❌✗]/gu, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function extractEmojiInfo(rawLine) {
  const matches = rawLine.match(/<a?:([a-zA-Z0-9_]+):\d+>/g) || [];
  let klass = '', role = '';
  for (const emoji of matches) {
    const m = emoji.match(/<a?:([a-zA-Z0-9_]+):\d+>/);
    if (!m) continue;
    const name = m[1].toLowerCase();
    for (const [key, val] of Object.entries(EMOJI_CLASS_MAP)) {
      if (name.includes(key)) { klass = val; break; }
    }
    for (const [key, val] of Object.entries(EMOJI_ROLE_MAP)) {
      if (name.includes(key)) { role = val; break; }
    }
  }
  return { klass, role };
}

function cleanName(raw) {
  let s = stripAll(raw);
  // Nummer + Leerzeichen am Anfang: "8 Thryne" → "Thryne"
  s = s.replace(/^\d+\s+/, '').trim();
  // Backtick-Nummer: "`8`" am Anfang
  s = s.replace(/^`?\d+`?\s*/, '').trim();
  // Sonderzeichen am Anfang
  s = s.replace(/^[^a-zA-ZäöüÄÖÜß0-9]+/, '').trim();
  return s;
}

function isConfirmedLine(raw) {
  return /[✅✔☑✓]/.test(raw);
}

function isTentativeOrAbsence(name) {
  const lower = (name || '').toLowerCase();
  return lower.includes('tentative') || lower.includes('absence') ||
         lower.includes('bench') || lower.includes('absent') || lower.includes('late');
}

function isHeaderLine(cleaned) {
  // Zeilen die Gruppen-Info oder Zählungen sind
  return /^(melee|ranged|healer|healers|tank|tanks)\s*\d*/i.test(cleaned) ||
         /^\d+\s*\(\+\d+\)/.test(cleaned) ||
         /^web\s*view/i.test(cleaned) ||
         /^https?:\/\//.test(cleaned) ||
         /^\[comp\]/i.test(cleaned) ||
         /^<#\d+>/.test(cleaned) ||
         cleaned === '' || cleaned === '-' || cleaned === '–' || cleaned === '—' ||
         /^-+$/.test(cleaned) ||
         /^\d+$/.test(cleaned);
}

function getClassFromField(fieldName) {
  const clean = stripAll(fieldName).toLowerCase().replace(/[^a-zäöü]/gi, '');
  return CLASS_MAP[clean] || '';
}

function getRoleFromField(fieldName) {
  const clean = stripAll(fieldName).toLowerCase().replace(/[^a-zäöü]/gi, '');
  return ROLE_MAP[clean] || '';
}

// Erkennt ob ein Field das Gruppen-Format hat (Group 1, Group 2 etc.)
function isGroupField(fieldName) {
  return /group\s*\d+/i.test(stripAll(fieldName || ''));
}

// Einzelnen Spieler-Eintrag aus einer Zeile extrahieren
function extractPlayer(line, defaultClass, defaultRole) {
  const { klass: emojiKlass, role: emojiRole } = extractEmojiInfo(line);
  const name = cleanName(line);
  if (!name || name.length < 2) return null;
  if (isHeaderLine(name)) return null;
  if (isTentativeOrAbsence(name)) return null;
  return {
    name,
    class: defaultClass || emojiKlass || '',
    spec:  '',
    role:  defaultRole  || emojiRole  || '',
  };
}

function parseRaidhelperEmbed(message) {
  if (!message.embeds?.length) return null;
  const embed = message.embeds[0];
  if (!embed) return null;

  const result = {
    eventId: message.id,
    title:   stripAll(embed.title || embed.description?.split('\n')[0] || 'Raid Event'),
    signups: [],
  };

  if (!embed.fields?.length) return null;

  const fields = embed.fields;

  // Prüfen ob ✅ Marker vorhanden (Confirmed-Filter aktiv machen)
  const hasConfirmMarkers = fields.some(f =>
    (f.value || '').split('\n').some(l => isConfirmedLine(l))
  );

  for (const field of fields) {
    const fieldName = field.name || '';
    if (isTentativeOrAbsence(stripAll(fieldName))) continue;

    const defaultClass = getClassFromField(fieldName);
    const defaultRole  = getRoleFromField(fieldName);
    const rawValue     = field.value || '';

    // Jede Zeile einzeln verarbeiten
    const lines = rawValue.split('\n').map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
      // Confirmed-Filter: wenn ✅ im Embed vorhanden, nur ✅-Zeilen nehmen
      if (hasConfirmMarkers && !isConfirmedLine(line)) {
        const cleanedForCheck = stripAll(line);
        if (!isHeaderLine(cleanedForCheck)) {
          console.log(`[Parser] Skip (nicht ✅): ${cleanedForCheck}`);
        }
        continue;
      }

      const player = extractPlayer(line, defaultClass, defaultRole);
      if (player) result.signups.push(player);
    }
  }

  // Duplikate entfernen (nach Name)
  const seen = new Set();
  result.signups = result.signups.filter(s => {
    const key = s.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[Parser] ${result.signups.length} Spieler für "${result.title}"`);
  result.signups.forEach(s => console.log(`  → ${s.name} | ${s.class || '?'} | ${s.role || '?'}`));
  return result.signups.length > 0 ? result : null;
}

function isRaidhelperMessage(message) {
  const rhBotId = process.env.RAIDHELPER_BOT_ID || '579155972115660803';
  if (message.author?.id === rhBotId) return true;
  if (message.webhookId && message.embeds?.length > 0) {
    const embed = message.embeds[0];
    const text  = stripAll((embed?.title || '') + (embed?.description || ''));
    if (text.toLowerCase().includes('raid') ||
        text.toLowerCase().includes('signup') ||
        embed?.fields?.some(f =>
          CLASS_MAP[stripAll(f.name||'').toLowerCase().replace(/[^a-zäöü]/gi,'')] ||
          /group\s*\d+/i.test(f.name || '')
        )) return true;
  }
  return false;
}

module.exports = { parseRaidhelperEmbed, isRaidhelperMessage };
