require('dotenv').config();
const { REST, Routes, ApplicationCommandOptionType } = require('discord.js');

const commands = [
  {
    name:        'sync-raid',
    description: 'Synct ein bestimmtes Raidhelper-Event manuell ins Sheet',
    options: [
      {
        name:        'message_id',
        description: 'Discord Message-ID des Raidhelper-Posts',
        type:        ApplicationCommandOptionType.String,
        required:    true,
      },
      {
        name:        'channel_id',
        description: 'Channel-ID (optional, Standard: aktueller Channel)',
        type:        ApplicationCommandOptionType.String,
        required:    false,
      },
    ],
  },
  {
    name:        'scan-channel',
    description: 'Scannt diesen Channel nach Raidhelper-Events und lässt dich eines auswählen',
  },
  {
    name:        'roster-status',
    description: 'Zeigt den aktuellen Roster aus dem Google Sheet',
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registriere Slash-Commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Commands registriert!');
  } catch (err) {
    console.error('❌ Fehler:', err);
  }
})();
