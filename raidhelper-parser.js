// raidhelper-parser.js - FINAL VERSION
// Basiert auf echten Embed-Daten vom Debug-Script

// Raidhelper Custom Emoji ID → Klasse
const EMOJI_TO_CLASS = {
  // Klassen-Emojis (aus Field-Anfang: <:Tank:...>, <:Warrior:...> etc.)
  '580801859221192714': 'Tank',         // :Tank:
  '579532030153588739': 'Krieger',      // :Warrior:
  '579532029906124840': 'Paladin',      // :Paladin:
  '579532029880827924': 'Jäger',        // :Hunter:
  '579532030086217748': 'Schurke',      // :Rogue:
  '579532029901799437': 'Priester',     // :Priest:
  '579532030056857600': 'Schamane',     // :Shaman:
  '579532030161977355': 'Magier',       // :Mage:
  '579532029851336716': 'Hexenmeister', // :Warlock:
  '579532029675438081': 'Druide',       // :Druid:
};

// Raidhelper Spec-Emoji ID → Klasse + Rolle
const EMOJI_TO_SPEC = {
  // Warrior
  '637564445215948810': { class:'Krieger',      spec:'Fury',          role:'Melee DPS' },
  '637564421980946442': { class:'Krieger',      spec:'Arms',          role:'Melee DPS' },
  '637564463126200330': { class:'Krieger',      spec:'Protection',    role:'Tank'      },
  // Paladin
  '637564297622454272': { class:'Paladin',      spec:'Holy',          role:'Heal'      },
  '637564297647489034': { class:'Paladin',      spec:'Protection',    role:'Tank'      },
  '637564297953673216': { class:'Paladin',      spec:'Retribution',   role:'Melee DPS' },
  // Hunter
  '637564202021814277': { class:'Jäger',        spec:'Beast Mastery', role:'Ranged DPS'},
  '637564202130866186': { class:'Jäger',        spec:'Survival',      role:'Ranged DPS'},
  '637564231266566144': { class:'Jäger',        spec:'Marksmanship',  role:'Ranged DPS'},
  // Rogue
  '637564352333086720': { class:'Schurke',      spec:'Combat',        role:'Melee DPS' },
  '637564323407699988': { class:'Schurke',      spec:'Assassination', role:'Melee DPS' },
  '637564352471703562': { class:'Schurke',      spec:'Subtlety',      role:'Melee DPS' },
  // Priest
  '637564323530539019': { class:'Priester',     spec:'Holy',          role:'Heal'      },
  '637564323291725825': { class:'Priester',     spec:'Shadow',        role:'Ranged DPS'},
  '637564323537059860': { class:'Priester',     spec:'Discipline',    role:'Heal'      },
  // Shaman
  '637564379595931649': { class:'Schamane',     spec:'Elemental',     role:'Ranged DPS'},
  '637564379772223489': { class:'Schamane',     spec:'Enhancement',   role:'Melee DPS' },
  '637564379847458846': { class:'Schamane',     spec:'Restoration',   role:'Heal'      },
  // Mage
  '637564231545389056': { class:'Magier',       spec:'Arcane',        role:'Ranged DPS'},
  '637564231695822849': { class:'Magier',       spec:'Fire',          role:'Ranged DPS'},
  '637564231308247050': { class:'Magier',       spec:'Frost',         role:'Ranged DPS'},
  // Warlock
  '637564406984867861': { class:'Hexenmeister', spec:'Affliction',    role:'Ranged DPS'},
  '637564406682877964': { class:'Hexenmeister', spec:'Destruction',   role:'Ranged DPS'},
  '637564407101907969': { class:'Hexenmeister', spec:'Demonology',    role:'Ranged DPS'},
  // Druid
  '637564171696734209': { class:'Druide',       spec:'Feral',         role:'Melee DPS' },
  '637564172007112723': { class:'Druide',       spec:'Restoration',   role:'Heal'      },
  '637564172061900820': { class:'Druide',       spec:'Feral Tank',    role:'Tank'      },
  '637564172032643093': { class:'Druide',       spec:'Balance',       role:'Ranged DPS'},
};

// System-Emoji IDs (keine Spieler-Info)
const SYSTEM_EMOJIS = new Set([
  '593930359985405983', // Date
  '593930235658108939', // Time
  '593930418932285440', // SignUps
  '858794526176444467', // Countdown
  '1124529969926779050',// LeaderX
  '1124529967611523272',// DateX
  '1124529971428339752',// SignUpsX
  '1124529972883767398',// TimeX
  '1124530049329139772',// CountdownX
  '598989638098747403', // Tanks (Zähler)
  '592440132129521664', // Dps (Zähler)
  '592446395596931072', // Ranged (Zähler)
  '592438128057253898', // Healers (Zähler)
  '980421332850339840', // arrow_down
  '1001612352430546964',// Confirmed ✅
  '1001609523032764557',// Cancelled ❌
  '676284492754976788', // Tentative
  '612343589070045200', // Absence
]);

function getAllEmojiIds(text) {
  const matches = text.match(/<a?:[a-zA-Z0-9_]+:(\d+)>/g) || [];
  return matches.map(m => {
    const r = m.match(/<a?:[a-zA-Z0-9_]+:(\d+)>/);
    return r ? r[1] : null;
  }).filter(Boolean);
}

function isSystemOnlyLine(line) {
  const ids = getAllEmojiIds(line);
  if (ids.length === 0) return false;
  return ids.every(id => SYSTEM_EMOJIS.has(id));
}

function isConfirmed(line) {
  return line.includes('<:Confirmed:1001612352430546964>');
}

function isCancelled(line) {
  return line.includes('<:Cancelled:1001609523032764557>');
}

function isClassHeader(line) {
  // Erkennt Zeilen wie: <:Warrior:...>   **__Warrior__ (1)**
  const stripped = stripAll(line);
  return /^(Tank|Warrior|Paladin|Hunter|Rogue|Priest|Shaman|Mage|Warlock|Druid)\s+\(\d+\)$/i.test(stripped);
}

function stripAll(text) {
  let s = text;
  s = s.replace(/<a?:[a-zA-Z0-9_]+:\d+>/g, '');
  s = s.replace(/<t:\d+(?::[tTdDfFR])?>/g, '');
  s = s.replace(/<@!?\d+>/g, '');
  s = s.replace(/<#\d+>/g, '');
  s = s.replace(/\*\*/g, '').replace(/\*/g, '');
  s = s.replace(/__/g, '');
  s = s.replace(/`/g, '');
  s = s.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
  s = s.replace(/[✅✔☑✓❌✗]/gu, '');
  s = s.replace(/-#/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function extractPlayerFromLine(line) {
  // Prüfen ob Zeile ein Spieler ist
  if (isCancelled(line)) return null;

  const ids = getAllEmojiIds(line);
  const stripped = stripAll(line);

  // Leere Zeilen / Striche / System-Only
  if (!stripped || stripped === '-' || stripped === '–' || stripped === '—') return null;
  if (/^-+$/.test(stripped)) return null;
  if (isSystemOnlyLine(line)) return null;
  if (isClassHeader(line)) return null;

  // Footer-Zeilen
  if (stripped.startsWith('Web View') || stripped.startsWith('[Web View]')) return null;
  if (stripped.startsWith('Sent by') || stripped.startsWith('-# ')) return null;
  if (/^https?:\/\//.test(stripped)) return null;

  // Tentative/Absence-Zeilen
  if (line.includes('<:Tentative:') || line.includes('<:Absence:')) return null;
  if (/tentative|absence/i.test(stripped)) return null;

  // Gruppen-Header: "Group 1:", "Group 2:" etc.
  if (/^Group\s+\d+:/i.test(stripped)) return null;

  // Wochentags-Header: "montag:", "mittwoch:" etc.
  if (/^(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|monday|tuesday|wednesday|thursday|friday|saturday|sunday):/i.test(stripped)) return null;

  // bench:
  if (/^bench:/i.test(stripped)) return null;

  // Zähler-Zeilen: "Melee 6", "Ranged 12", "Healers 6", "26 (+1)"
  if (/^(melee|ranged|healer|healers|tank|tanks)\s+\d+$/i.test(stripped)) return null;
  if (/^\d+\s*\(\+\d+\)/.test(stripped)) return null;
  if (/^Edit Name$/i.test(stripped)) return null;

  // Klassen-Info aus Emojis extrahieren
  let klass = '', spec = '', role = '';
  for (const id of ids) {
    if (SYSTEM_EMOJIS.has(id)) continue;
    if (EMOJI_TO_SPEC[id]) {
      klass = EMOJI_TO_SPEC[id].class;
      spec  = EMOJI_TO_SPEC[id].spec;
      role  = EMOJI_TO_SPEC[id].role;
      break;
    }
    if (EMOJI_TO_CLASS[id] && !klass) {
      klass = EMOJI_TO_CLASS[id];
    }
  }

  // Name bereinigen
  let name = stripped;
  // Nummer am Anfang entfernen: "7 Honeypaw" → "Honeypaw"
  name = name.replace(/^\d+\s+/, '').trim();
  // Sonderzeichen am Anfang
  name = name.replace(/^[^a-zA-ZäöüÄÖÜßÀ-ÿ0-9]+/, '').trim();

  if (!name || name.length < 2) return null;
  // Nochmal Junk-Check
  if (/^\d+$/.test(name)) return null;

  return { name, class: klass, spec, role };
}

function isInfoField(field) {
  // Fields 0-5 sind immer Info-Fields (Leader, Date, Time, Counts)
  // Erkennungsmerkmal: Zeilen enthalten nur System-Emojis und Timestamps
  const lines = (field.value || '').split('\n').filter(l => l.trim());
  if (!lines.length) return true;
  const allSystem = lines.every(l => {
    const s = stripAll(l);
    return !s ||
           s === '​' ||                        // zero-width space
           /^<t:\d+/.test(l) ||               // Timestamp
           isSystemOnlyLine(l) ||
           /^\*\*\d+\*\*\s*\(\+\d+\)/.test(l) || // "**26** (+1)"
           /^Tanks|Melee|Ranged|Healer/i.test(s);
  });
  return allSystem;
}

function parseRaidhelperEmbed(message) {
  if (!message.embeds?.length) return null;
  const embed = message.embeds[0];
  if (!embed?.fields?.length) return null;

  // Eigene Posts (Roster-Update) ignorieren
  const title = embed.title || '';
  if (title.includes('Raid Roster')) return null;

  const result = {
    eventId: message.id,
    title:   embed.title || 'Raid Event',
    signups: [],
  };

  const fields = embed.fields;

  // Confirmed-Marker vorhanden? (Gruppen-Format)
  const hasConfirm = fields.some(f =>
    (f.value || '').includes('<:Confirmed:1001612352430546964>')
  );

  for (const field of fields) {
    if (isInfoField(field)) continue;

    const lines = (field.value || '').split('\n').map(l => l.trim()).filter(Boolean);

    // Kontext-Rolle aus erstem Klassen-Header im Field
    let contextRole = '';
    const firstStripped = stripAll(lines[0] || '');
    if (/^Tank\s*\(\d+\)/i.test(firstStripped))                    contextRole = 'Tank';
    else if (/^(Warrior|Krieger)\s*\(\d+\)/i.test(firstStripped)) contextRole = 'Melee DPS';
    else if (/^(Rogue|Schurke)\s*\(\d+\)/i.test(firstStripped))   contextRole = 'Melee DPS';
    else if (/^(Hunter|Jäger)\s*\(\d+\)/i.test(firstStripped))    contextRole = 'Ranged DPS';
    else if (/^(Mage|Magier)\s*\(\d+\)/i.test(firstStripped))     contextRole = 'Ranged DPS';
    else if (/^(Warlock|Hexenmeister)\s*\(\d+\)/i.test(firstStripped)) contextRole = 'Ranged DPS';
    const isTankField = /^Tank\s*\(\d+\)/i.test(firstStripped);

    for (const line of lines) {
      if (hasConfirm && !isConfirmed(line)) continue;

      const player = extractPlayerFromLine(line);
      if (player) {
        // Tank-Header: immer Tank unabhängig vom Spec-Emoji
        if (isTankField) player.role = 'Tank';
        // Sonstige Kontext-Rolle nur wenn Emoji keine Rolle liefert
        else if (contextRole && !player.role) player.role = contextRole;
        result.signups.push(player);
      }
    }
  }

  // Duplikate entfernen (nach Name, case-insensitive)
  const seen = new Set();
  result.signups = result.signups.filter(s => {
    const key = s.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[Parser] ${result.signups.length} Spieler für "${result.title}"`);
  result.signups.forEach(s => console.log(`  → ${s.name} | ${s.class} | ${s.spec} | ${s.role}`));
  return result.signups.length > 0 ? result : null;
}

function isRaidhelperMessage(message) {
  // Eigene Posts ignorieren
  if (message.embeds?.[0]?.title?.includes('Raid Roster')) return false;

  const rhBotId = process.env.RAIDHELPER_BOT_ID || '579155972115660803';
  if (message.author?.id === rhBotId) return true;
  if (message.webhookId && message.embeds?.length > 0) {
    const embed = message.embeds[0];
    // Hat Raidhelper-typische Fields mit bekannten Emoji-IDs
    if (embed.fields?.some(f =>
      (f.value || '').includes('593930359985405983') || // Date emoji
      (f.value || '').includes('1124529967611523272') || // DateX emoji
      (f.value || '').includes('637564') || // Spec-Emojis
      (f.value || '').includes('1001612352430546964') // Confirmed emoji
    )) return true;
    // Titel-Check
    const text = (embed.title || '') + (embed.description || '');
    if (text.toLowerCase().includes('raid') && embed.fields?.length > 3) return true;
  }
  return false;
}

module.exports = { parseRaidhelperEmbed, isRaidhelperMessage };
