// raidhelper-parser.js - Clean Final

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
  'tank':'Tank', 'tanks':'Tank',
  'warrior':'Melee DPS', 'krieger':'Melee DPS',
  'paladin':'Heal',
  'hunter':'Ranged DPS', 'jäger':'Ranged DPS',
  'rogue':'Melee DPS', 'schurke':'Melee DPS',
  'priest':'Heal', 'priester':'Heal',
  'shaman':'Heal', 'schamane':'Heal',
  'mage':'Ranged DPS', 'magier':'Ranged DPS',
  'warlock':'Ranged DPS', 'hexenmeister':'Ranged DPS',
  'druid':'Ranged DPS', 'druide':'Ranged DPS',
  'healer':'Heal', 'healers':'Heal',
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
  'holy':'Heal', 'resto':'Heal', 'restoration':'Heal', 'discipline':'Heal', 'disc':'Heal',
  'shadow':'Ranged DPS', 'balance':'Ranged DPS', 'elemental':'Ranged DPS',
  'enhancement':'Melee DPS', 'enh':'Melee DPS', 'feral':'Melee DPS',
  'fury':'Melee DPS', 'arms':'Melee DPS', 'combat':'Melee DPS',
  'assassination':'Melee DPS', 'subtlety':'Melee DPS',
  'marksmanship':'Ranged DPS', 'beastmastery':'Ranged DPS', 'survival':'Ranged DPS',
  'fire':'Ranged DPS', 'frost':'Ranged DPS', 'arcane':'Ranged DPS',
  'affliction':'Ranged DPS', 'destruction':'Ranged DPS', 'demonology':'Ranged DPS',
  'retribution':'Melee DPS', 'ret':'Melee DPS', 'unholy':'Melee DPS',
};

// Alle Discord-Formatierung und Sonderzeichen entfernen
function stripAll(text) {
  let s = text;
  // Custom Emojis <:name:id>
  s = s.replace(/<a?:[a-zA-Z0-9_]+:\d+>/g, '');
  // Discord Timestamps <t:123456:D> etc.
  s = s.replace(/<t:\d+(?::[tTdDfFR])?>/g, '');
  // Mentions
  s = s.replace(/<@!?\d+>/g, '');
  s = s.replace(/<#\d+>/g, '');
  // Markdown: **, *, __, _
  s = s.replace(/\*\*/g, '').replace(/\*/g, '');
  s = s.replace(/__/g, '').replace(/_/g, '');
  // Backticks
  s = s.replace(/`/g, '');
  // Unicode Emojis
  s = s.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
  // Status-Symbole
  s = s.replace(/[✅✔☑✓❌✗]/gu, '');
  // Mehrfache Leerzeichen
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
  // Sonderzeichen am Anfang
  s = s.replace(/^[^a-zA-ZäöüÄÖÜß0-9]+/, '').trim();
  return s;
}

function isConfirmedLine(raw) {
  return /[✅✔☑✓]/.test(raw);
}

function isTentativeOrAbsence(text) {
  const lower = (text || '').toLowerCase();
  return lower.includes('tentative') || lower.includes('absence') ||
         lower.includes('bench') || lower.includes('absent') || lower.includes('late');
}

// Prüft ob eine bereinigte Zeile ein Klassen/Rollen-Header oder System-Info ist
function isJunkLine(cleaned) {
  if (!cleaned || cleaned.length < 2) return true;
  // Striche / Leer
  if (/^[-–—]+$/.test(cleaned)) return true;
  // Reine Zahlen
  if (/^\d+$/.test(cleaned)) return true;
  // Klassen/Rollen-Header mit Zahl in Klammern: "Tank (2)", "Warrior (1)", "Priest (3)"
  if (/^(tank|warrior|paladin|hunter|rogue|priest|shaman|mage|warlock|druid|deathknight|healer|healers|melee|ranged|krieger|priester|schamane|magier|hexenmeister|druide|todesritter|jäger|schurke)\s*\(\d+\)$/i.test(cleaned)) return true;
  // Zähler "Melee 6", "Ranged 12", "Healers 6" etc.
  if (/^(melee|ranged|healer|healers|tank|tanks)\s+\d+$/i.test(cleaned)) return true;
  // Gesamt-Zähler "26 (+1)"
  if (/^\d+\s*\(\+\d+\)/.test(cleaned)) return true;
  // Datum/Zeit Reste (nach Timestamp-Strip können Reste wie "1)" übrig bleiben)
  if (/^\d+\)$/.test(cleaned)) return true;
  // Links
  if (/^https?:\/\//.test(cleaned)) return true;
  if (/^web\s*view/i.test(cleaned)) return true;
  if (/^\[comp\]/i.test(cleaned)) return true;
  if (/^<#\d+>/.test(cleaned)) return true;
  // Einzelne Buchstaben/Zeichen
  if (cleaned.length === 1) return true;
  return false;
}

function getClassFromField(fieldName) {
  const clean = stripAll(fieldName).toLowerCase().replace(/[^a-zäöü]/gi, '');
  return CLASS_MAP[clean] || '';
}

function getRoleFromField(fieldName) {
  const clean = stripAll(fieldName).toLowerCase().replace(/[^a-zäöü]/gi, '');
  return ROLE_MAP[clean] || '';
}

// Prüft ob ein Field ein Info/System-Field ist (Datum, Zeit, Ankündigung etc.)
function isInfoField(fieldName) {
  const clean = stripAll(fieldName || '').toLowerCase();
  // Leere Fields oder reiner Emoji-Name
  if (!clean || clean.length < 1) return true;
  // Bekannte Info-Field-Namen von Raidhelper
  const infoKeywords = ['date', 'time', 'leader', 'info', 'description', 'note',
                        'datum', 'uhrzeit', 'leiter', 'beschreibung', 'notiz',
                        'server', 'channel', 'link', 'url'];
  if (infoKeywords.some(k => clean.includes(k))) return true;
  // Wenn nach stripAll nur Zahlen/Sonderzeichen übrig
  if (/^[\d\s\-_]+$/.test(clean)) return true;
  return false;
}

function parseRaidhelperEmbed(message) {
  if (!message.embeds?.length) return null;
  const embed = message.embeds[0];
  if (!embed?.fields?.length) return null;

  const result = {
    eventId: message.id,
    title:   stripAll(embed.title || embed.description?.split('\n')[0] || 'Raid Event'),
    signups: [],
  };

  const fields = embed.fields;

  // Prüfen ob ✅ Marker vorhanden
  const hasConfirmMarkers = fields.some(f =>
    (f.value || '').split('\n').some(l => isConfirmedLine(l))
  );

  for (const field of fields) {
    const fieldName  = field.name || '';
    const fieldValue = field.value || '';

    // Info-Fields überspringen (Datum, Zeit etc.)
    if (isInfoField(fieldName)) {
      console.log(`[Parser] Skip Info-Field: "${stripAll(fieldName)}"`);
      continue;
    }

    // Tentative/Absence überspringen
    if (isTentativeOrAbsence(stripAll(fieldName))) continue;

    const defaultClass = getClassFromField(fieldName);
    const defaultRole  = getRoleFromField(fieldName);
    const lines = fieldValue.split('\n').map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
      // Confirmed-Filter
      if (hasConfirmMarkers && !isConfirmedLine(line)) {
        const c = stripAll(line);
        if (!isJunkLine(c)) console.log(`[Parser] Skip (nicht ✅): ${c}`);
        continue;
      }

      const { klass: emojiKlass, role: emojiRole } = extractEmojiInfo(line);
      const name = cleanName(line);

      if (isJunkLine(name)) continue;
      if (isTentativeOrAbsence(name)) continue;

      result.signups.push({
        name,
        class: defaultClass || emojiKlass || '',
        spec:  '',
        role:  defaultRole  || emojiRole  || '',
      });
    }
  }

  // Duplikate entfernen
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
