// raidhelper-parser.js
// Unterstützt beide Raidhelper-Formate:
// Format A: Klassen als Fields (Tank, Warrior etc.) mit Spielernamen
// Format B: Gruppen als Fields (Group 1, Group 2 etc.) mit ✅ für confirmed

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
  'tank':'Tank',        'tanks':'Tank',
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

// Klassen-Erkennung aus Emoji (Raidhelper nutzt Klassen-Emojis)
function detectClassFromEmoji(text) {
  // Raidhelper Klassen-Emojis (Unicode Codepoints)
  if (text.includes('🗡') || text.includes('⚔'))  return 'Krieger';
  if (text.includes('🔨') || text.includes('✨'))  return 'Paladin';
  if (text.includes('🏹'))                          return 'Jäger';
  if (text.includes('🗡️'))                         return 'Schurke';
  if (text.includes('⭐') || text.includes('💫'))  return 'Priester';
  if (text.includes('⚡') || text.includes('🌊'))  return 'Schamane';
  if (text.includes('❄️') || text.includes('🔥')) return 'Magier';
  if (text.includes('💀') || text.includes('👁'))  return 'Hexenmeister';
  if (text.includes('🌿') || text.includes('🍃')) return 'Druide';
  return '';
}

function cleanPlayerName(text) {
  // Nummer am Anfang entfernen (z.B. "7 Honeypaw" → "Honeypaw")
  let name = text.replace(/^\d+\s+/, '').trim();
  // Discord Mentions entfernen
  name = name.replace(/<@!?\d+>/g, '').trim();
  // Häkchen und Status-Symbole entfernen
  name = name.replace(/^[✅✔☑✓\-–—]\s*/u, '').trim();
  // Emojis am Anfang entfernen
  name = name.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+\s*/gu, '').trim();
  // Sonderzeichen am Anfang
  name = name.replace(/^[^a-zA-ZäöüÄÖÜß0-9]+/, '').trim();
  return name;
}

function isConfirmed(line) {
  // ✅ oder ✔ am Anfang = confirmed
  return /^[✅✔☑✓]/u.test(line.trim());
}

function isEmptySlot(line) {
  const clean = line.trim();
  return clean === '-' || clean === '–' || clean === '—' ||
         clean === '' || clean.toLowerCase() === 'empty' ||
         /^-+$/.test(clean);
}

function getClassFromFieldName(fieldName) {
  const lower = fieldName.toLowerCase().replace(/[^a-zäöü]/gi, '');
  return CLASS_MAP[lower] || '';
}

function getRoleFromFieldName(fieldName) {
  const lower = fieldName.toLowerCase().replace(/[^a-zäöü]/gi, '');
  return ROLE_MAP[lower] || '';
}

function isGroupFormat(fields) {
  // Prüfen ob Fields "Group 1", "Group 2" etc. heißen
  return fields.some(f => /group\s*\d+/i.test(f.name || ''));
}

function isClassFormat(fields) {
  // Prüfen ob Fields Klassennamen sind (Tank, Warrior etc.)
  return fields.some(f => {
    const lower = (f.name || '').toLowerCase().replace(/[^a-zäöü]/gi, '');
    return CLASS_MAP[lower] || ROLE_MAP[lower];
  });
}

function parseGroupFormat(fields) {
  // Format B: Group 1, Group 2 etc. mit ✅ für confirmed
  const signups = [];
  for (const field of fields) {
    const fieldName = (field.name || '').trim();
    if (isEmptySlot(fieldName)) continue;

    const lines = (field.value || '').split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (isEmptySlot(line)) continue;

      // Nur confirmed (✅) einschließen
      if (!isConfirmed(line)) {
        console.log(`[Parser] Übersprungen (nicht confirmed): ${line}`);
        continue;
      }

      const klass = detectClassFromEmoji(line);
      const name  = cleanPlayerName(line);
      if (!name || name.length < 2) continue;

      signups.push({ name, class: klass, spec: '', role: '' });
    }
  }
  return signups;
}

function parseClassFormat(fields) {
  // Format A: Klassen als Field-Namen mit Spielerliste
  const signups = [];
  for (const field of fields) {
    const fieldName  = (field.name  || '').trim();
    const fieldValue = (field.value || '').trim();
    if (!fieldValue || isEmptySlot(fieldValue)) continue;

    // Tentative/Absence überspringen
    const lowerName = fieldName.toLowerCase();
    if (lowerName.includes('tentative') || lowerName.includes('absence') ||
        lowerName.includes('bench')     || lowerName.includes('absent')) continue;

    const klass = getClassFromFieldName(fieldName);
    const role  = getRoleFromFieldName(fieldName);

    const lines = fieldValue.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (isEmptySlot(line)) continue;

      // Bei Klassen-Format: confirmed-Filter optional
      // Wenn ✅ vorhanden → nur confirmed; wenn keine ✅ → alle nehmen
      const hasConfirmMarkers = lines.some(l => isConfirmed(l));
      if (hasConfirmMarkers && !isConfirmed(line)) {
        console.log(`[Parser] Übersprungen (nicht confirmed): ${line}`);
        continue;
      }

      const name = cleanPlayerName(line);
      if (!name || name.length < 2) continue;

      let spec = '';
      const specMatch = line.match(/\(([^)]+)\)/);
      if (specMatch) spec = specMatch[1].trim();

      signups.push({ name, class: klass, spec, role });
    }
  }
  return signups;
}

function parseRaidhelperEmbed(message) {
  if (!message.embeds || message.embeds.length === 0) return null;
  const embed = message.embeds[0];
  if (!embed) return null;

  const result = {
    eventId: message.id,
    title:   embed.title || embed.description?.split('\n')[0] || 'Raid Event',
    signups: [],
  };

  if (embed.fields && embed.fields.length > 0) {
    const fields = embed.fields;

    if (isGroupFormat(fields)) {
      console.log('[Parser] Format erkannt: Gruppen (Group 1, Group 2...)');
      result.signups = parseGroupFormat(fields);
    } else if (isClassFormat(fields)) {
      console.log('[Parser] Format erkannt: Klassen (Tank, Warrior...)');
      result.signups = parseClassFormat(fields);
    } else {
      // Fallback: beide versuchen
      console.log('[Parser] Format unbekannt – versuche beide Parser');
      result.signups = parseGroupFormat(fields);
      if (result.signups.length === 0) {
        result.signups = parseClassFormat(fields);
      }
    }
  }

  // Fallback: Description
  if (result.signups.length === 0 && embed.description) {
    const lines = embed.description.split('\n');
    for (const line of lines) {
      if (!isConfirmed(line) && line.includes('✅')) continue;
      const name = cleanPlayerName(line);
      if (name && name.length >= 2 && !name.startsWith('http')) {
        result.signups.push({ name, class: '', spec: '', role: '' });
      }
    }
  }

  console.log(`[Parser] ${result.signups.length} Spieler gefunden für "${result.title}"`);
  return result.signups.length > 0 ? result : null;
}

function isRaidhelperMessage(message) {
  const rhBotId = process.env.RAIDHELPER_BOT_ID || '579155972115660803';
  if (message.author?.id === rhBotId) return true;
  if (message.webhookId && message.embeds?.length > 0) {
    const embed = message.embeds[0];
    const text  = (embed?.title || '') + (embed?.description || '') + (embed?.footer?.text || '');
    if (text.toLowerCase().includes('raid') ||
        text.toLowerCase().includes('signup') ||
        embed?.fields?.some(f => /group\s*\d+/i.test(f.name || '') ||
          CLASS_MAP[(f.name||'').toLowerCase().replace(/[^a-zäöü]/gi,'')])) {
      return true;
    }
  }
  return false;
}

module.exports = { parseRaidhelperEmbed, isRaidhelperMessage };
