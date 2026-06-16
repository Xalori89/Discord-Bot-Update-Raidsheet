require('dotenv').config();
const { REST, Routes, ApplicationCommandOptionType } = require('discord.js');

const commands = [
  {
    name:        'sync-raid',
    description: 'Synct ein Event manuell ins Sheet + postet in #raidsheet',
    options: [
      { name:'message_id', description:'Discord Message-ID des Raidhelper-Posts', type:ApplicationCommandOptionType.String, required:true },
      { name:'channel_id', description:'Channel-ID (optional)', type:ApplicationCommandOptionType.String, required:false },
    ],
  },
  {
    name:        'scan-channel',
    description: 'Scannt Channel nach Raidhelper-Events zum Auswählen',
  },
  {
    name:        'post-roster',
    description: 'Postet den aktuellen Roster sofort in #raidsheet mit @F O X - Mitglieder Ping',
  },
  {
    name:        'roster-status',
    description: 'Zeigt den aktuellen Roster (nur für dich)',
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    console.log('Registriere Commands...');
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
    console.log('✅ Commands registriert!');
  } catch (err) { console.error('❌', err); }
})();
