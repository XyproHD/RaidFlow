/**
 * Registriert die Slash-Commands für RaidFlow beim Discord API.
 * Einmal ausführen nach Bot-Erstellung bzw. bei Änderung der Commands:
 *   cd discord-bot && node deploy-commands.js
 *
 * Für Test-Guild (sofort sichtbar): setze GUILD_ID in .env.
 * Ohne GUILD_ID: globale Registrierung (kann bis zu 1 Stunde verzögert sein).
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_BOT_CLIENT_ID || process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
  console.error('Fehlt: DISCORD_BOT_TOKEN und DISCORD_BOT_CLIENT_ID (oder DISCORD_CLIENT_ID) in .env');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('raidflow')
    .setDescription('RaidFlow: Server einrichten und Raidgruppen verwalten')
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Server in RaidFlow einrichten und Basis-Rollen anlegen')
    )
    .addSubcommand((sub) =>
      sub
        .setName('group')
        .setDescription('Raidgruppe anlegen (erstellt Discord-Rolle Raidflowgroup-<Name>)')
        .addStringOption((opt) =>
          opt
            .setName('groupname')
            .setDescription('Name der Raidgruppe')
            .setRequired(true)
        )
    )
    .toJSON(),
];

const rest = new REST().setToken(token);

(async () => {
  try {
    const guildId = process.env.GUILD_ID;
    if (guildId) {
      console.log(`Registriere Commands für Test-Guild ${guildId}...`);
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log('Guild-Commands erfolgreich registriert.');
    } else {
      console.log('Registriere globale Commands...');
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log('Globale Commands erfolgreich registriert.');
    }
  } catch (e) {
    console.error('Fehler:', e);
    process.exit(1);
  }
})();
