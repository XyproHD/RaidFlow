/**
 * Registriert die Slash-Commands für RaidFlow beim Discord API.
 * Einmal ausführen nach Bot-Erstellung bzw. bei Änderung der Commands:
 *   cd discord-bot && node deploy-commands.js
 *
 * Immer: globale Commands (alle Server; Discord kann neue Subcommands bis ca. 1 h verzögern).
 * Zusätzlich sofort auf deinem Server: GUILD_ID und/oder DISCORD_DEPLOY_GUILD_IDS (kommagetrennte Snowflakes).
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { ApplicationCommandType, EntryPointCommandHandlerType } from 'discord-api-types/v10';

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_BOT_CLIENT_ID || process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
  console.error('Fehlt: DISCORD_BOT_TOKEN und DISCORD_BOT_CLIENT_ID (oder DISCORD_CLIENT_ID) in .env');
  process.exit(1);
}

const raidflowSlash = new SlashCommandBuilder()
    .setName('raidflow')
    .setDescription('RaidFlow: Server einrichten und Raidgruppen verwalten')
    .addSubcommand((sub) =>
      sub
        .setName('check')
        .setDescription('Status: Webapp/DB, Mindestrollen, deine Discord- und Webapp-Zuordnung')
    )
    .addSubcommand((sub) =>
      sub
        .setName('home')
        .setDescription('Profil-Dashboard: Charaktere anzeigen und in Discord anlegen')
    )
    .addSubcommand((sub) =>
      sub
        .setName('help')
        .setDescription('Zeigt eine Übersicht aller RaidFlow-Befehle mit Beschreibung')
    )
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Server in RaidFlow einrichten: Standardrollen, bestehende Rollen zuordnen oder eigene Rollen anlegen')
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
    .toJSON();

/** App Home (DM / „App öffnen“): erfordert im Developer Portal ggf. User-Install. */
const appHomeEntry = {
  name: 'start',
  type: ApplicationCommandType.PrimaryEntryPoint,
  handler: EntryPointCommandHandlerType.AppHandler,
};

const commands = [raidflowSlash, appHomeEntry];

const rest = new REST().setToken(token);

function collectGuildIdsForInstantDeploy() {
  const fromList = (process.env.DISCORD_DEPLOY_GUILD_IDS || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const single = process.env.GUILD_ID?.trim();
  return [...new Set(single ? [...fromList, single] : fromList)];
}

(async () => {
  try {
    const guildIds = collectGuildIdsForInstantDeploy();
    for (const gid of guildIds) {
      console.log(`[deploy-commands] Guild-Slash-Commands für ${gid} (sofort sichtbar)…`);
      await rest.put(Routes.applicationGuildCommands(clientId, gid), { body: commands });
    }
    if (guildIds.length === 0) {
      console.log('[deploy-commands] Kein GUILD_ID / DISCORD_DEPLOY_GUILD_IDS — nur globale Registrierung.');
    }

    console.log('[deploy-commands] Globale Slash-Commands (alle Server)…');
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('[deploy-commands] Fertig: global + ggf. Guild-Kopien.');
  } catch (e) {
    console.error('[deploy-commands] Slash-Commands konnten nicht registriert werden:', e);
    if (e?.rawError) console.error('[deploy-commands] Discord API:', JSON.stringify(e.rawError));
    // Exit 0: Viele Deploy-Skripte nutzen "deploy && node index.js" — bei exit 1 würde der Bot nie starten.
    process.exit(0);
  }
})();
