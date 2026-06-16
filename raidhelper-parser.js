// raidhelper-parser.js
// Angepasst auf das spezifische Raidhelper-Format des Servers

const CLASS_MAP = {
  // Englisch
  'tank':'Tank', 'warrior':'Krieger', 'paladin':'Paladin',
  'hunter':'Jäger', 'rogue':'Schurke', 'priest':'Priester',
  'shaman':'Schamane', 'mage':'Magier', 'warlock':'Hexenmeister',
  'druid':'Druide', 'deathknight':'Todesritter',
  // Deutsch
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

function cleanPlayerName(text) {
  // Nummer am Anfang entfernen (z.B. "7 Honeypaw/Vo" → "Honeypaw/Vo")
  let name = text.replace(/^\d+\s+/, '').trim();
  // Discord Mentions entfernen
  name = name.replace(/<@!?\d+>/g, '').trim();
  // Emojis entfernen (Unicode)
  name = name.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
  // Sonderzeichen am Anfang entfernen
  name = name.replace(/^[^a-zA-ZäöüÄÖÜß0-9]+/, '').trim();
  return name;
}

function getClassFromFieldName(fieldName) {
  const lower = fieldName.toLowerCase().replace(/[^a-zäöü]/gi, '');
  return CLASS_MAP[lower] || '';
}

function getRoleFromFieldName(fieldName) {
  const lower = fieldName.toLowerCase().replace(/[^a-zäöü]/gi, '');
  return ROLE_MAP[lower] || '';
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

  // Felder durchgehen
  if (embed.fields && embed.fields.length > 0) {
    for (const field of embed.fields) {
      const fieldName  = (field.name  || '').trim();
      const fieldValue = (field.value || '').trim();

      if (!fieldValue || fieldValue === '—' || fieldValue === '-') continue;

      // System-Felder überspringen
      const lowerName = fieldName.toLowerCase();
      if (lowerName.includes('tentative') ||
          lowerName.includes('absence') ||
          lowerName.includes('bench') ||
          lowerName.includes('late') ||
          lowerName.includes('absent')) continue;

      const klass = getClassFromFieldName(fieldName);
      const role  = getRoleFromFieldName(fieldName);

      // Spieler aus dem Field-Value extrahieren
      const lines = fieldValue.split('\n').map(l => l.trim()).filter(Boolean);

      for (const line of lines) {
        if (line === '—' || line === '-' || line.toLowerCase() === 'empty') continue;

        const name = cleanPlayerName(line);
        if (!name || name.length < 2) continue;

        // Spec aus Klammern extrahieren falls vorhanden
        let spec = '';
        const specMatch = line.match(/\(([^)]+)\)/);
        if (specMatch) spec = specMatch[1].trim();

        result.signups.push({ name, class: klass, spec, role });
      }
    }
  }

  // Fallback: Description parsen wenn keine Fields
  if (result.signups.length === 0 && embed.description) {
    const lines = embed.description.split('\n');
    for (const line of lines) {
      const name = cleanPlayerName(line);
      if (name && name.length >= 2 && !name.startsWith('http')) {
        result.signups.push({ name, class: '', spec: '', role: '' });
      }
    }
  }

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
        embed?.fields?.some(f => CLASS_MAP[f.name?.toLowerCase().replace(/[^a-zäöü]/gi, '')])) {
      return true;
    }
  }
  return false;
}

module.exports = { parseRaidhelperEmbed, isRaidhelperMessage };
