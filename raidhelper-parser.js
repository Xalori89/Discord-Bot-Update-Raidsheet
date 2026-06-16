// raidhelper-parser.js - Final Version
// Bereinigt Discord Custom Emojis aus Raidhelper-Embeds

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

// Raidhelper Custom Emoji Namen → Klasse
const EMOJI_CLASS_MAP = {
  'warrior':'Krieger',   'paladin':'Paladin',   'hunter':'Jäger',
  'rogue':'Schurke',     'priest':'Priester',   'shaman':'Schamane',
  'mage':'Magier',       'warlock':'Hexenmeister', 'druid':'Druide',
  'deathknight':'Todesritter', 'dk':'Todesritter',
  // Spec-spezifische Emojis
  'protection':'Tank',   'prot':'Tank',
  'holy':'Heal',         'resto':'Heal',        'restoration':'Heal',
  'discipline':'Heal',   'disc':'Heal',
  'shadow':'Ranged DPS', 'balance':'Ranged DPS','boomkin':'Ranged DPS',
  'elemental':'Ranged DPS', 'ele':'Ranged DPS',
  'enhancement':'Melee DPS', 'enh':'Melee DPS',
  'feral':'Melee DPS',   'fury':'Melee DPS',    'arms':'Melee DPS',
  'combat':'Melee DPS',  'assassination':'Melee DPS', 'subtlety':'Melee DPS',
  'marksmanship':'Ranged DPS', 'mm':'Ranged DPS',
  'beastmastery':'Ranged DPS', 'survival':'Ranged DPS',
  'fire':'Ranged DPS',   'frost':'Ranged DPS',  'arcane':'Ranged DPS',
  'affliction':'Ranged DPS', 'destruction':'Ranged DPS', 'demonology':'Ranged DPS',
  'retribution':'Melee DPS', 'ret':'Melee DPS',
  'unholy':'Melee DPS',  'blooddk':'Melee DPS',
};

function stripDiscordEmojis(text) {
  // Custom Discord Emojis entfernen: <:name:id> und <a:name:id>
  return text.replace(/<a?:[a-zA-Z0-9_]+:\d+>/g, '').trim();
}

function extractEmojiInfo(text) {
  // Klassen-Info aus Custom Emoji-Namen extrahieren
  const matches = text.match(/<a?:([a-zA-Z0-9_]+):\d+>/g) || [];
  let klass = '', role = '';
  for (const emoji of matches) {
    const nameMatch = emoji.match(/<a?:([a-zA-Z0-9_]+):\d+>/);
    if (!nameMatch) continue;
    const emojiName = nameMatch[1].toLowerCase();
    // Klassen-Emoji erkennen
    for (const [key, val] of Object.entries(EMOJI_CLASS_MAP)) {
      if (emojiName.includes(key)) {
        if (CLASS_MAP[val.toLowerCase()] || Object.values(CLASS_MAP).includes(val)) {
          klass = val;
        }
        if (ROLE_MAP[key]) role = ROLE_MAP[key];
        break;
      }
    }
  }
  return { klass, role };
}

function cleanPlayerName(text) {
  // Custom Discord Emojis entfernen
  let name = stripDiscordEmojis(text);
  // Nummer am Anfang entfernen
  name = name.replace(/^\d+\s+/, '').trim();
  // Discord Mentions entfernen
  name = name.replace(/<@!?\d+>/g, '').trim();
  // Häkchen und Status-Symbole entfernen
  name = name.replace(/^[✅✔☑✓\-–—]\s*/u, '').trim();
  // Unicode Emojis entfernen
  name = name.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
  // Sonderzeichen am Anfang
  name = name.replace(/^[^a-zA-ZäöüÄÖÜß0-9]+/, '').trim();
  // Mehrfache Leerzeichen
  name = name.replace(/\s+/g, ' ').trim();
  return name;
}

function isConfirmedLine(line) {
  return /^[✅✔☑✓]/u.test(line.trim());
}

function isEmptySlot(line) {
  const clean = stripDiscordEmojis(line).trim();
  return clean === '' || clean === '-' || clean === '–' || clean === '—' ||
         /^-+$/.test(clean) || clean.toLowerCase() === 'empty';
}

function isTentativeOrAbsence(fieldName) {
  const lower = fieldName.toLowerCase();
  return lower.includes('tentative') || lower.includes('absence') ||
         lower.includes('bench')     || lower.includes('absent')  ||
         lower.includes('late');
}

function getClassFromFieldName(fieldName) {
  const clean = stripDiscordEmojis(fieldName);
  const lower = clean.toLowerCase().replace(/[^a-zäöü\s]/gi, '').trim();
  const key = lower.replace(/\s+/g, '');
  return CLASS_MAP[key] || CLASS_MAP[lower] || '';
}

function getRoleFromFieldName(fieldName) {
  const clean = stripDiscordEmojis(fieldName);
  const lower = clean.toLowerCase().replace(/[^a-zäöü\s]/gi, '').trim();
  const key = lower.replace(/\s+/g, '');
  return ROLE_MAP[key] || ROLE_MAP[lower] || '';
}

function isGroupFormat(fields) {
  return fields.some(f => /group\s*\d+/i.test(stripDiscordEmojis(f.name || '')));
}

function parseGroupFormat(fields) {
  const signups = [];
  for (const field of fields) {
    if (isTentativeOrAbsence(field.name || '')) continue;
    const lines = (field.value || '').split('\n').map(l => l.trim()).filter(Boolean);
    const hasConfirm = lines.some(l => isConfirmedLine(l));

    for (const line of lines) {
      if (isEmptySlot(line)) continue;
      if (hasConfirm && !isConfirmedLine(line)) {
        console.log(`[Parser] Skip (nicht ✅): ${stripDiscordEmojis(line).trim()}`);
        continue;
      }
      const { klass, role } = extractEmojiInfo(line);
      const name = cleanPlayerName(line);
      if (!name || name.length < 2) continue;
      signups.push({ name, class: klass, spec: '', role });
    }
  }
  return signups;
}

function parseClassFormat(fields) {
  const signups = [];
  for (const field of fields) {
    if (isTentativeOrAbsence(field.name || '')) continue;
    const fieldValue = (field.value || '').trim();
    if (!fieldValue) continue;

    const klass = getClassFromFieldName(field.name || '');
    const role  = getRoleFromFieldName(field.name || '');
    const lines = fieldValue.split('\n').map(l => l.trim()).filter(Boolean);
    const hasConfirm = lines.some(l => isConfirmedLine(l));

    for (const line of lines) {
      if (isEmptySlot(line)) continue;
      if (hasConfirm && !isConfirmedLine(line)) {
        console.log(`[Parser] Skip (nicht ✅): ${stripDiscordEmojis(line).trim()}`);
        continue;
      }
      const emojiInfo = extractEmojiInfo(line);
      const name = cleanPlayerName(line);
      if (!name || name.length < 2) continue;
      let spec = '';
      const specMatch = line.match(/\(([^)]+)\)/);
      if (specMatch) spec = specMatch[1].trim();
      signups.push({
        name,
        class: klass || emojiInfo.klass,
        spec,
        role:  role  || emojiInfo.role,
      });
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
    title:   stripDiscordEmojis(embed.title || embed.description?.split('\n')[0] || 'Raid Event'),
    signups: [],
  };

  if (embed.fields && embed.fields.length > 0) {
    if (isGroupFormat(embed.fields)) {
      console.log('[Parser] Format: Gruppen (Group 1, Group 2...)');
      result.signups = parseGroupFormat(embed.fields);
    } else {
      console.log('[Parser] Format: Klassen (Tank, Warrior...)');
      result.signups = parseClassFormat(embed.fields);
    }
  }

  // Fallback: Description
  if (result.signups.length === 0 && embed.description) {
    const lines = embed.description.split('\n');
    for (const line of lines) {
      if (isEmptySlot(line)) continue;
      const name = cleanPlayerName(line);
      if (name && name.length >= 2 && !name.startsWith('http')) {
        result.signups.push({ name, class: '', spec: '', role: '' });
      }
    }
  }

  console.log(`[Parser] ${result.signups.length} Spieler (confirmed) für "${result.title}"`);
  result.signups.forEach(s => console.log(`  → ${s.name} | ${s.class} | ${s.role}`));
  return result.signups.length > 0 ? result : null;
}

function isRaidhelperMessage(message) {
  const rhBotId = process.env.RAIDHELPER_BOT_ID || '579155972115660803';
  if (message.author?.id === rhBotId) return true;
  if (message.webhookId && message.embeds?.length > 0) {
    const embed = message.embeds[0];
    const text  = stripDiscordEmojis((embed?.title || '') + (embed?.description || ''));
    if (text.toLowerCase().includes('raid') ||
        text.toLowerCase().includes('signup') ||
        embed?.fields?.some(f =>
          /group\s*\d+/i.test(f.name || '') ||
          CLASS_MAP[stripDiscordEmojis(f.name||'').toLowerCase().replace(/[^a-zäöü]/gi,'')]
        )) {
      return true;
    }
  }
  return false;
}

module.exports = { parseRaidhelperEmbed, isRaidhelperMessage };
