// raidhelper-parser.js
// Liest Raidhelper Signups direkt aus Discord Message Embeds
// Keine API nötig – funktioniert immer

const CLASS_EMOJI_MAP = {
  // Warrior
  '⚔️':'Warrior', '🛡️':'Warrior',
  // Paladin
  '🔨':'Paladin',
  // Hunter
  '🏹':'Hunter',
  // Rogue
  '🗡️':'Rogue', '🔪':'Rogue',
  // Priest
  '✨':'Priest', '⭐':'Priest',
  // Shaman
  '⚡':'Shaman', '🌊':'Shaman',
  // Mage
  '❄️':'Mage', '🔥':'Mage',
  // Warlock
  '💀':'Warlock', '👁️':'Warlock',
  // Druid
  '🌿':'Druid', '🍃':'Druid',
};

// Klassen-Keywords für Text-Erkennung
const CLASS_KEYWORDS = [
  'warrior','krieger','paladin','hunter','jäger','jaeger',
  'rogue','schurke','priest','priester','shaman','schamane',
  'mage','magier','warlock','hexenmeister','druid','druide',
  'deathknight','todesritter','death knight',
];

const ROLE_KEYWORDS = {
  'Tank':      ['tank','tanks','prot','protection','blood'],
  'Heal':      ['heal','healer','heals','holy','resto','restoration','discipline','disc'],
  'Melee DPS': ['melee','fury','arms','combat','assassination','subtlety','sub','feral','enhancement','enh','retribution','ret','unholy','frost dk'],
  'Ranged DPS':['ranged','balance','boomkin','elemental','ele','marksmanship','mm','beast mastery','bm','survival','sv','fire','frost mage','arcane','affliction','aff','destruction','dest','demonology','demo','shadow','spriest'],
};

function detectRole(text) {
  const lower = text.toLowerCase();
  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return role;
  }
  return '';
}

function detectClass(text) {
  const lower = text.toLowerCase();
  if (lower.includes('warrior') || lower.includes('krieger'))       return 'Krieger';
  if (lower.includes('paladin'))                                      return 'Paladin';
  if (lower.includes('hunter') || lower.includes('jäger') || lower.includes('jaeger')) return 'Jäger';
  if (lower.includes('rogue') || lower.includes('schurke'))         return 'Schurke';
  if (lower.includes('priest') || lower.includes('priester'))       return 'Priester';
  if (lower.includes('shaman') || lower.includes('schamane'))       return 'Schamane';
  if (lower.includes('mage') || lower.includes('magier'))           return 'Magier';
  if (lower.includes('warlock') || lower.includes('hexenmeister'))  return 'Hexenmeister';
  if (lower.includes('druid') || lower.includes('druide'))          return 'Druide';
  if (lower.includes('death knight') || lower.includes('deathknight') || lower.includes('todesritter')) return 'Todesritter';
  return '';
}

function parseRaidhelperEmbed(message) {
  if (!message.embeds || message.embeds.length === 0) return null;

  const embed = message.embeds[0];
  if (!embed) return null;

  // Raidhelper-Embed erkennen: hat Fields mit Spielernamen
  // Typische Struktur: Field-Name = Rolle/Klasse, Field-Value = Spielerliste
  const result = {
    eventId:    message.id,
    title:      embed.title || embed.description || 'Raid Event',
    signups:    [],
    raw:        embed,
  };

  // Methode 1: Fields auslesen (Standard Raidhelper Format)
  if (embed.fields && embed.fields.length > 0) {
    for (const field of embed.fields) {
      const fieldName  = field.name  || '';
      const fieldValue = field.value || '';

      // Leere oder System-Felder überspringen
      if (!fieldValue || fieldValue === '—' || fieldValue === '-' || fieldValue.trim() === '') continue;
      if (fieldName.toLowerCase().includes('info')) continue;
      if (fieldName.toLowerCase().includes('date')) continue;
      if (fieldName.toLowerCase().includes('time')) continue;

      // Rolle aus Field-Name erkennen
      const roleFromField = detectRole(fieldName);
      const classFromField = detectClass(fieldName);

      // Spieler aus Field-Value extrahieren
      // Raidhelper trennt Spieler mit \n, manchmal mit Emojis davor
      const lines = fieldValue.split('\n').map(l => l.trim()).filter(Boolean);

      for (const line of lines) {
        // Leere Slots überspringen (z.B. "1. —" oder "Empty")
        if (line === '—' || line === '-' || line.toLowerCase() === 'empty') continue;

        // Nummerierung entfernen (z.B. "1. Spielername" oder "1) Spielername")
        let cleanLine = line.replace(/^\d+[\.\)]\s*/, '').trim();

        // Emojis am Anfang entfernen und für Klassen-Erkennung nutzen
        const emojiMatch = cleanLine.match(/^(\p{Emoji}+)\s*/u);
        let emojiClass = '';
        if (emojiMatch) {
          cleanLine = cleanLine.replace(emojiMatch[0], '').trim();
        }

        // Discord-Mentions entfernen (<@123456>)
        cleanLine = cleanLine.replace(/<@!?\d+>/g, '').trim();

        // Klammern-Inhalt für Spec nutzen (z.B. "Spieler (Holy)")
        let spec = '';
        const specMatch = cleanLine.match(/\(([^)]+)\)/);
        if (specMatch) {
          spec = specMatch[1].trim();
          cleanLine = cleanLine.replace(specMatch[0], '').trim();
        }

        if (!cleanLine || cleanLine.length < 2) continue;

        const klass = classFromField || emojiClass || detectClass(spec) || detectClass(fieldName);
        const role  = roleFromField  || detectRole(fieldName) || detectRole(spec);

        result.signups.push({
          name:  cleanLine,
          class: klass,
          spec:  spec,
          role:  role,
        });
      }
    }
  }

  // Methode 2: Description auslesen falls keine Fields
  if (result.signups.length === 0 && embed.description) {
    const lines = embed.description.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      const klass = detectClass(line);
      const role  = detectRole(line);
      let name    = line
        .replace(/<@!?\d+>/g, '')
        .replace(/^\d+[\.\)]\s*/, '')
        .replace(/\([^)]+\)/g, '')
        .trim();
      if (name && name.length >= 2 && !name.startsWith('http')) {
        result.signups.push({ name, class: klass, spec: '', role });
      }
    }
  }

  return result.signups.length > 0 ? result : null;
}

function isRaidhelperMessage(message) {
  // Raidhelper Bot User ID prüfen
  const rhBotId = process.env.RAIDHELPER_BOT_ID || '579155972115660803';
  if (message.author?.id === rhBotId) return true;

  // Fallback: Embed-Inhalt prüfen
  if (message.embeds?.length > 0) {
    const embed = message.embeds[0];
    const text  = (embed?.title || '') + (embed?.description || '') + (embed?.footer?.text || '');
    if (text.toLowerCase().includes('raid') ||
        text.toLowerCase().includes('signup') ||
        text.toLowerCase().includes('sign up') ||
        text.toLowerCase().includes('sign-up')) {
      return true;
    }
  }
  return false;
}

module.exports = { parseRaidhelperEmbed, isRaidhelperMessage };
