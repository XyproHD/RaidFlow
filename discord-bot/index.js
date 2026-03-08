/**
 * RaidFlow Discord-Bot
 * Slash-Commands: /raidflow setup, /raidflow group <groupname>
 * Rechte: Nur Server-Owner oder ADMINISTRATOR oder MANAGE_GUILD (siehe DiscordBot.md Abschnitt 0).
 *
 * Umgebung: .env oder .env.local im discord-bot/ Ordner, oder .env.local im Projektroot.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
import { Client, GatewayIntentBits, PermissionFlagsBits } from 'discord.js';

const DISCORD_ADMINISTRATOR = Number(PermissionFlagsBits.Administrator);
const DISCORD_MANAGE_GUILD = Number(PermissionFlagsBits.ManageGuild);

function hasSetupPermission(member) {
  if (!member) return false;
  const isOwner = member.guild.ownerId === member.user.id;
  const perms = member.permissions?.bitfield ?? 0n;
  const hasAdmin = (perms & BigInt(DISCORD_ADMINISTRATOR)) !== 0n;
  const hasManageGuild = (perms & BigInt(DISCORD_MANAGE_GUILD)) !== 0n;
  return isOwner || hasAdmin || hasManageGuild;
}

async function callWebapp(path, body) {
  const base = process.env.WEBAPP_URL || 'http://localhost:3000';
  const secret = process.env.BOT_SETUP_SECRET;
  if (!secret) throw new Error('BOT_SETUP_SECRET not set');
  const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Webapp ${res.status}: ${text}`);
  }
  return res.json();
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', () => {
  console.log(`RaidFlow Bot eingeloggt als ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // Unterstützung für /raidflow setup sowie alte Namen /raidflow_setup und /raidflow_group
  let sub;
  let groupNameRaw = null;
  const cmd = interaction.commandName;
  if (cmd === 'raidflow') {
    sub = interaction.options.getSubcommand();
    if (sub === 'group') groupNameRaw = interaction.options.getString('groupname', true);
  } else if (cmd === 'raidflow_setup') {
    sub = 'setup';
  } else if (cmd === 'raidflow_group') {
    sub = 'group';
    groupNameRaw = interaction.options.getString('groupname', true);
  } else {
    return;
  }

  const member = interaction.member;

  if (!hasSetupPermission(member)) {
    return interaction.reply({
      content: 'Du hast keine Berechtigung. Nur Server-Gründer oder Nutzer mit „Server verwalten“ bzw. Administrator können diesen Befehl ausführen.',
      ephemeral: true,
    });
  }

  if (sub === 'setup') {
    await interaction.deferReply({ ephemeral: true });
    try {
      const guild = interaction.guild;
      const guildName = guild.name;

      const roleNames = {
        guildmaster: 'RaidFlow-Gildenmeister',
        raidleader: 'RaidFlow-Raidleader',
        raider: 'RaidFlow-Raider',
      };

      await interaction.editReply('Rollen werden erstellt…').catch(() => {});

      const created = {};
      for (const [key, name] of Object.entries(roleNames)) {
        const role = await guild.roles.create({
          name,
          reason: 'RaidFlow Setup',
        });
        created[key] = role.id;
      }

      await interaction.editReply('Webapp wird benachrichtigt…').catch(() => {});

      await callWebapp('/api/bot/guild', {
        discordGuildId: guild.id,
        name: guildName,
        discordRoleGuildmasterId: created.guildmaster,
        discordRoleRaidleaderId: created.raidleader,
        discordRoleRaiderId: created.raider,
      });

      await interaction.editReply(
        `RaidFlow-Setup abgeschlossen. Server wurde in der Webapp angelegt. Rollen: ${roleNames.guildmaster}, ${roleNames.raidleader}, ${roleNames.raider}.`
      );
    } catch (e) {
      console.error('[raidflow setup]', e);
      await interaction.editReply(`Fehler: ${e.message}`).catch(() => {});
    }
    return;
  }

  if (sub === 'group') {
    const groupName = (groupNameRaw ?? interaction.options.getString('groupname', true)).trim();
    if (!groupName) {
      return interaction.reply({ content: 'Bitte einen Gruppennamen angeben.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      await interaction.editReply('Discord-Rolle wird erstellt…').catch(() => {});

      const guild = interaction.guild;
      const roleName = `Raidflowgroup-${groupName}`;
      const role = await guild.roles.create({
        name: roleName,
        reason: 'RaidFlow Group',
      });

      await interaction.editReply('Webapp wird benachrichtigt…').catch(() => {});

      await callWebapp('/api/bot/raid-group', {
        discordGuildId: guild.id,
        name: groupName,
        discordRoleId: role.id,
      });

      await interaction.editReply(`Raidgruppe „${groupName}" angelegt. Discord-Rolle: ${roleName}.`);
    } catch (e) {
      console.error('[raidflow group]', e);
      await interaction.editReply(`Fehler: ${e.message}`).catch(() => {});
    }
    return;
  }
});

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error('DISCORD_BOT_TOKEN fehlt in .env');
  process.exit(1);
}

client.login(token);
