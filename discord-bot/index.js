/**
 * RaidFlow Discord-Bot
 * Slash-Commands: /raidflow help, /raidflow setup, /raidflow group <groupname>
 * Rechte: Nur Server-Owner oder ADMINISTRATOR oder MANAGE_GUILD.
 * Gateway: optional GuildMembers (privileged). Nur nutzen, wenn im Discord Developer Portal
 * unter Bot → „Privileged Gateway Intents“ → **Server Members Intent** aktiviert ist **und**
 * die Umgebungsvariable DISCORD_GUILD_MEMBERS_INTENT=1 (oder true) gesetzt ist. Sonst Login-Fehler
 * „Used disallowed intents“. Ohne diesen Intent startet der Bot; Rollen-Sync läuft dann nur
 * über Webapp-Bootstrap (getGuildsForUser), nicht live per Event.
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

import {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

const DISCORD_ADMINISTRATOR = Number(PermissionFlagsBits.Administrator);
const DISCORD_MANAGE_GUILD = Number(PermissionFlagsBits.ManageGuild);

/** Privilegierter Intent – nur wenn im Portal aktiviert + explizit per Env eingeschaltet. */
const USE_GUILD_MEMBERS_INTENT = /^(1|true|yes)$/i.test(
  String(process.env.DISCORD_GUILD_MEMBERS_INTENT ?? '').trim()
);

const RAIDFLOW_ROLES = ['guildmaster', 'raidleader', 'raider'];
const RAIDFLOW_LABELS = { guildmaster: 'Gildenmeister', raidleader: 'Raidleader', raider: 'Raider' };
const STANDARD_NAMES = {
  guildmaster: 'RaidFlow-Gildenmeister',
  raidleader: 'RaidFlow-Raidleader',
  raider: 'RaidFlow-Raider',
};

// State für mehrstufige Setup-Interaktionen (TTL 15 Min)
const setupState = new Map();
const STATE_TTL_MS = 15 * 60 * 1000;

function stateKey(interaction) {
  return `${interaction.guildId}:${interaction.user.id}`;
}

function getState(interaction) {
  const key = stateKey(interaction);
  const entry = setupState.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    setupState.delete(key);
    return null;
  }
  return entry.data;
}

function setState(interaction, data) {
  const key = stateKey(interaction);
  setupState.set(key, { data, expiresAt: Date.now() + STATE_TTL_MS });
}

function clearState(interaction) {
  setupState.delete(stateKey(interaction));
}

function hasSetupPermission(member) {
  if (!member) return false;
  const isOwner = member.guild.ownerId === member.user.id;
  const perms = member.permissions?.bitfield ?? 0n;
  const hasAdmin = (perms & BigInt(DISCORD_ADMINISTRATOR)) !== 0n;
  const hasManageGuild = (perms & BigInt(DISCORD_MANAGE_GUILD)) !== 0n;
  return isOwner || hasAdmin || hasManageGuild;
}

function getWebappHeaders() {
  const secret = process.env.BOT_SETUP_SECRET;
  if (!secret) throw new Error('BOT_SETUP_SECRET not set');
  const headers = { Authorization: `Bearer ${secret}` };
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) headers['x-vercel-protection-bypass'] = bypass;
  return headers;
}

async function getWebapp(path) {
  const base = process.env.WEBAPP_URL || 'http://localhost:3000';
  const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    method: 'GET',
    headers: getWebappHeaders(),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Webapp ${res.status}: ${text}`);
  }
  return res.json();
}

async function callWebapp(path, body) {
  const base = process.env.WEBAPP_URL || 'http://localhost:3000';
  const headers = {
    'Content-Type': 'application/json',
    ...getWebappHeaders(),
  };
  const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Webapp ${res.status}: ${text}`);
  }
  return res.json();
}

/** GET mit Query + Bot-Secret (Diagnose). */
async function getWebappJson(path, queryParams) {
  const base = (process.env.WEBAPP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const qs = new URLSearchParams(queryParams);
  const url = `${base}${path}?${qs.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: getWebappHeaders(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Webapp ${res.status}: ${text}`);
  }
  return JSON.parse(text);
}

function formatRolePresenceLine(guild, roleId, label) {
  if (!roleId) return `• ${label}: _nicht in DB hinterlegt_`;
  const r = guild.roles.cache.get(roleId);
  return r
    ? `• ${label}: vorhanden („${r.name}“, \`${roleId}\`)`
    : `• ${label}: **fehlt auf dem Server** (in DB: \`${roleId}\`)`;
}

function discordMainRaidFlowRole(member, gmId, rlId, rdId) {
  const ids = member.roles.cache;
  if (gmId && ids.has(gmId)) return 'Gildenmeister';
  if (rlId && ids.has(rlId)) return 'Raidleader';
  if (rdId && ids.has(rdId)) return 'Raider';
  return null;
}

async function runRaidflowCheck(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;
  const discordUserId = interaction.user.id;
  const discordGuildId = guild.id;

  try {
    const data = await getWebappJson('/api/bot/guild-check', {
      discordGuildId,
      discordUserId,
    });

    console.log(
      JSON.stringify({
        level: 'info',
        scope: 'RF_BOT_CHECK',
        step: 'bot_guild_check_ok',
        discordGuildId,
        discordUserId,
        guildInDatabase: data.guildInDatabase,
        rfUserGuildRole: data.user?.rfUserGuildRole,
      })
    );

    let member = interaction.member;
    try {
      member = await guild.members.fetch({ user: discordUserId });
    } catch {
      /* interaction.member */
    }

    const g = data.rfGuild;
    const gmId = g?.discordRoleGuildmasterId;
    const rlId = g?.discordRoleRaidleaderId;
    const rdId = g?.discordRoleRaiderId;

    const lines = [];
    lines.push('**RaidFlow – Status-Check**');
    lines.push('');
    lines.push('**Webapp / Datenbank**');
    lines.push(`• Server in DB: **${data.guildInDatabase ? 'ja' : 'nein'}**`);
    lines.push(`• Mindestrollen in DB vollständig: **${g?.minimumRolesConfigured ? 'ja' : 'nein'}**`);
    lines.push(`• App-Config (Server erlaubt): **${data.allowedByAppConfig ? 'ja' : 'nein'}**`);
    if (g) lines.push(`• Raidgruppen in DB: **${g.raidGroupCount}**`);
    lines.push('');
    lines.push('**Konfigurierte Rollen auf Discord**');
    if (g) {
      lines.push(formatRolePresenceLine(guild, gmId, 'Gildenmeister'));
      lines.push(formatRolePresenceLine(guild, rlId, 'Raidleader'));
      lines.push(formatRolePresenceLine(guild, rdId, 'Raider'));
    } else {
      lines.push('_(keine Gilde in der Webapp-DB)_');
    }
    lines.push('');
    lines.push('**Deine RaidFlow-Hauptrolle (Discord)**');
    const dr = discordMainRaidFlowRole(member, gmId, rlId, rdId);
    lines.push(dr ? `• **${dr}**` : '• _keine der drei Hauptrollen_');
    lines.push('');
    lines.push('**Webapp-Zuordnung (DB)**');
    lines.push(`• \`rf_user\`: **${data.user.rfUserExists ? 'ja' : 'nein'}**`);
    lines.push(`• \`rf_user_guild\` Rolle: **${data.user.rfUserGuildRole ?? '— fehlt —'}**`);
    lines.push(
      `• \`rf_guild_member\`: **${data.user.rfGuildMemberExists ? 'ja' : 'nein'}** (Raidgruppen-Links: ${data.user.raidGroupLinkCount})`
    );

    if (data.hints?.length) {
      lines.push('');
      lines.push('**Hinweise**');
      for (const h of data.hints) lines.push(`• ${h}`);
    }

    lines.push('');
    lines.push('_Logs: Vercel & Railway nach `RF_BOT_CHECK`; optional DB `rf_bot_diagnostic_log`._');

    const content = lines.join('\n').slice(0, 3900);
    await interaction.editReply({ content });
  } catch (e) {
    console.error(
      JSON.stringify({
        level: 'error',
        scope: 'RF_BOT_CHECK',
        step: 'bot_guild_check_failed',
        discordGuildId,
        discordUserId,
        error: String(e?.message || e),
      })
    );
    await interaction.editReply({
      content: `Check fehlgeschlagen: ${e.message}\n\nWEBAPP_URL, BOT_SETUP_SECRET und Erreichbarkeit der Webapp prüfen.`,
    });
  }
}

/** RaidFlow-Berechtigungen in der Webapp-DB aktualisieren (zentrales Sync-API). */
async function pushMemberPermissionSync(guildDiscordId, discordUserId, payload) {
  try {
    await callWebapp('/api/bot/sync-member', {
      discordGuildId: guildDiscordId,
      discordUserId,
      ...payload,
    });
  } catch (e) {
    console.error('[pushMemberPermissionSync]', e.message);
  }
}

/** Server-Rollen für Auswahl (ohne @everyone, ohne verwaltete Rollen), max 24 + "Neue Rolle". */
function getSelectableRoles(guild) {
  const roles = guild.roles.cache
    .filter((r) => r.id !== guild.id && !r.managed)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name }));
  return roles.slice(0, 24);
}

const gatewayIntents = [GatewayIntentBits.Guilds];
if (USE_GUILD_MEMBERS_INTENT) {
  gatewayIntents.push(GatewayIntentBits.GuildMembers);
}

const client = new Client({
  intents: gatewayIntents,
});

if (USE_GUILD_MEMBERS_INTENT) {
  console.info('[RaidFlow] GuildMembers-Intent aktiv (Live-Sync bei Join/Update/Leave).');
} else {
  console.warn(
    '[RaidFlow] GuildMembers-Intent aus: Bot startet ohne Member-Events. Für Live-Rechte-Sync: ' +
      'Im Discord-Portal „Server Members Intent“ aktivieren und Railway-Env DISCORD_GUILD_MEMBERS_INTENT=1 setzen.'
  );
}

// —— Help ———————————————————————————————————————————————————————————————————
function buildHelpContent() {
  return [
    '**RaidFlow – Befehle**',
    '',
    '**`/raidflow help`** – Zeigt diese Übersicht aller Befehle.',
    '',
    '**`/raidflow setup`** – Server in RaidFlow einrichten. Du kannst wählen:',
    '• **Standardrollen anlegen** – Der Bot erstellt die Rollen Gildenmeister, Raidleader und Raider.',
    '• **Bestehende Rollen zuordnen** – Du wählst für jede RaidFlow-Rolle eine bestehende Discord-Rolle oder lässt eine neue anlegen.',
    '• **Eigene Rollen anlegen** – Du gibst für jede RaidFlow-Rolle einen Namen ein; der Bot legt die Rollen auf dem Server an.',
    'Ist der Server bereits eingerichtet, kannst du Rollen löschen und neu einrichten oder einzelne Rollen ändern.',
    '',
    '**`/raidflow group <Groupname>`** – Raidgruppe anlegen. Erstellt eine Discord-Rolle `Raidflowgroup-<Name>` und verknüpft sie in der Webapp.',
    '',
    '**`/raidflow check`** – Status: Server in Webapp/DB, Mindestrollen, deine Discord-Rollen vs. Webapp-Zuordnung. **Für alle Server-Mitglieder.**',
    '',
    '**`help`**, **`setup`**, **`group`** nur mit Setup-Recht (Owner / Administrator / Server verwalten). **`check`** kann jeder auf dem Server nutzen.',
  ].join('\n');
}

// —— Setup: Nachricht mit Auswahl (Reconfigure oder Modus) ———————————————————
function buildReconfigureSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('rf_reconfigure')
      .setPlaceholder('Wie soll es weitergehen?')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Rollen löschen und neu einrichten')
          .setDescription('Bisherige Rollen löschen und Setup von vorn starten')
          .setValue('delete'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Rollen ändern')
          .setDescription('Eine RaidFlow-Rolle umbenennen, zuweisen oder neu anlegen')
          .setValue('change'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Abbrechen')
          .setDescription('Setup beenden ohne Änderungen')
          .setValue('abort')
      )
  );
}

function buildSetupModeSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('rf_setup_mode')
      .setPlaceholder('Setup-Methode wählen')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Standardrollen anlegen')
          .setDescription('RaidFlow-Gildenmeister, RaidFlow-Raidleader, RaidFlow-Raider anlegen')
          .setValue('standard'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Bestehende Rollen zuordnen')
          .setDescription('Vorhandene Server-Rollen den RaidFlow-Rollen zuweisen (oder neue anlegen)')
          .setValue('existing'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Eigene Rollen anlegen')
          .setDescription('Namen eingeben; der Bot legt die Rollen auf dem Server an')
          .setValue('custom')
      )
  );
}

function buildExistingRoleSelect(guild, raidFlowRole) {
  const options = getSelectableRoles(guild).map((r) =>
    new StringSelectMenuOptionBuilder().setLabel(r.name).setValue(r.id)
  );
  options.push(
    new StringSelectMenuOptionBuilder()
      .setLabel('➕ Neue Rolle anlegen')
      .setDescription('Rolle auf dem Server erstellen und zuordnen')
      .setValue('new')
  );
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`rf_existing_${raidFlowRole}`)
      .setPlaceholder(`Rolle für ${RAIDFLOW_LABELS[raidFlowRole]} wählen`)
      .addOptions(options)
  );
}

function buildChangeWhichSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('rf_change_which')
      .setPlaceholder('Welche RaidFlow-Rolle soll geändert werden?')
      .addOptions(
        RAIDFLOW_ROLES.map((r) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(RAIDFLOW_LABELS[r])
            .setValue(r)
        )
      )
  );
}

function buildChangeWhatSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('rf_change_what')
      .setPlaceholder('Was soll geändert werden?')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Rolle umbenennen')
          .setDescription('Discord-Rolle umbenennen')
          .setValue('rename'),
        new StringSelectMenuOptionBuilder()
          .setLabel('An andere bestehende Rolle zuweisen')
          .setDescription('Eine andere Server-Rolle für diese RaidFlow-Rolle verwenden')
          .setValue('assign'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Neue Rolle anlegen')
          .setDescription('Neue Discord-Rolle erstellen und zuordnen')
          .setValue('new')
      )
  );
}

async function runSetup(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;
  const guildId = guild.id;
  const baseUrl = (process.env.WEBAPP_URL || 'http://localhost:3000').replace(/\/$/, '');

  let existingConfig = null;
  try {
    const res = await fetch(
      `${baseUrl}/api/bot/guild?discordGuildId=${encodeURIComponent(guildId)}`,
      { headers: getWebappHeaders() }
    );
    if (res.ok) existingConfig = await res.json();
  } catch (e) {
    await interaction.editReply(`Fehler beim Prüfen der Konfiguration: ${e.message}`).catch(() => {});
    return;
  }

  if (existingConfig?.discordRoleGuildmasterId) {
    setState(interaction, { phase: 'reconfigure', existingConfig });
    await interaction.editReply({
      content: 'Dieser Server ist bereits für RaidFlow eingerichtet. Wie soll es weitergehen?',
      components: [buildReconfigureSelect()],
    });
    return;
  }

  setState(interaction, { phase: 'mode' });
  await interaction.editReply({
    content: 'Wie möchtest du die RaidFlow-Rollen einrichten?',
    components: [buildSetupModeSelect()],
  });
}

async function handleReconfigure(interaction, value) {
  if (value === 'abort') {
    clearState(interaction);
    await interaction.update({
      content: 'Setup abgebrochen. Es wurden keine Änderungen vorgenommen.',
      components: [],
    });
    return;
  }

  const state = getState(interaction);
  const existingConfig = state?.existingConfig;
  if (!existingConfig) {
    await interaction.update({ content: 'Sitzung abgelaufen. Bitte starte `/raidflow setup` erneut.', components: [] }).catch(() => {});
    return;
  }

  if (value === 'delete') {
    const guild = interaction.guild;
    const toDelete = [
      existingConfig.discordRoleGuildmasterId,
      existingConfig.discordRoleRaidleaderId,
      existingConfig.discordRoleRaiderId,
    ].filter(Boolean);
    await interaction.update({ content: 'Rollen werden gelöscht…', components: [] }).catch(() => {});
    for (const roleId of toDelete) {
      const role = guild.roles.cache.get(roleId);
      if (role) {
        try {
          await role.delete('RaidFlow Setup – Neu einrichten');
        } catch (e) {
          console.error('[raidflow setup] delete role', roleId, e);
        }
      }
    }
    clearState(interaction);
    setState(interaction, { phase: 'mode' });
    await interaction.editReply({
      content: 'Bisherige Rollen wurden gelöscht. Wie möchtest du die RaidFlow-Rollen einrichten?',
      components: [buildSetupModeSelect()],
    });
    return;
  }

  if (value === 'change') {
    setState(interaction, { phase: 'change_which', existingConfig });
    await interaction.update({
      content: 'Welche RaidFlow-Rolle soll geändert werden?',
      components: [buildChangeWhichSelect()],
    });
    return;
  }
}

async function handleChangeWhich(interaction, raidFlowRole) {
  const state = getState(interaction);
  if (!state?.existingConfig) {
    await interaction.update({ content: 'Sitzung abgelaufen. Bitte starte `/raidflow setup` erneut.', components: [] }).catch(() => {});
    return;
  }
  setState(interaction, { ...state, phase: 'change_what', changeRole: raidFlowRole });
  await interaction.update({
    content: `Was soll bei **${RAIDFLOW_LABELS[raidFlowRole]}** geändert werden?`,
    components: [buildChangeWhatSelect()],
  });
}

async function handleChangeWhat(interaction, what) {
  const state = getState(interaction);
  const guild = interaction.guild;
  const cfg = state?.existingConfig;
  const roleKey = state?.changeRole;
  if (!cfg || !roleKey) {
    await interaction.update({ content: 'Sitzung abgelaufen. Bitte starte `/raidflow setup` erneut.', components: [] }).catch(() => {});
    return;
  }

  const roleIdKey = `discordRole${roleKey.charAt(0).toUpperCase()}${roleKey.slice(1)}Id`;
  const currentRoleId = cfg[`discordRole${roleKey === 'guildmaster' ? 'Guildmaster' : roleKey === 'raidleader' ? 'Raidleader' : 'Raider'}Id`];
  if (!currentRoleId) {
    await interaction.update({ content: 'Konfiguration fehlt für diese Rolle.', components: [] }).catch(() => {});
    return;
  }

  if (what === 'rename') {
    const modal = new ModalBuilder()
      .setCustomId(`rf_modal_rename_${roleKey}`)
      .setTitle(`${RAIDFLOW_LABELS[roleKey]} umbenennen`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Neuer Rollenname')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)
        )
      );
    await interaction.showModal(modal);
    return;
  }

  if (what === 'assign') {
    const roles = getSelectableRoles(guild);
    if (roles.length === 0) {
      await interaction.update({
        content: 'Auf diesem Server gibt es keine wählbaren Rollen (außer @everyone).',
        components: [],
      }).catch(() => {});
      return;
    }
    setState(interaction, { ...state, phase: 'change_assign' });
    const options = roles.map((r) =>
      new StringSelectMenuOptionBuilder().setLabel(r.name).setValue(r.id)
    );
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rf_change_assign_${roleKey}`)
        .setPlaceholder('Rolle auswählen')
        .addOptions(options)
    );
    await interaction.update({
      content: `Welche bestehende Rolle soll für **${RAIDFLOW_LABELS[roleKey]}** verwendet werden?`,
      components: [row],
    });
    return;
  }

  if (what === 'new') {
    const modal = new ModalBuilder()
      .setCustomId(`rf_modal_new_${roleKey}`)
      .setTitle(`Neue Rolle für ${RAIDFLOW_LABELS[roleKey]}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Name der neuen Rolle')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)
        )
      );
    await interaction.showModal(modal);
    return;
  }
}

async function applyGuildConfigAndFinish(interaction, roleIds, message) {
  try {
    await callWebapp('/api/bot/guild', {
      discordGuildId: interaction.guild.id,
      name: interaction.guild.name,
      discordRoleGuildmasterId: roleIds.guildmaster,
      discordRoleRaidleaderId: roleIds.raidleader,
      discordRoleRaiderId: roleIds.raider,
    });
    clearState(interaction);
    await interaction.update({ content: message, components: [] }).catch(() => {});
  } catch (e) {
    await interaction.update({
      content: `Setup fehlgeschlagen: ${e.message}`,
      components: [],
    }).catch(() => {});
  }
}

async function handleSetupMode(interaction, value) {
  const guild = interaction.guild;

  if (value === 'standard') {
    await interaction.update({ content: 'Standardrollen werden erstellt…', components: [] }).catch(() => {});
    const created = {};
    for (const key of RAIDFLOW_ROLES) {
      const role = await guild.roles.create({
        name: STANDARD_NAMES[key],
        reason: 'RaidFlow Setup',
      });
      created[key] = role.id;
    }
    await applyGuildConfigAndFinish(
      interaction,
      created,
      `RaidFlow-Setup abgeschlossen. Rollen angelegt: ${STANDARD_NAMES.guildmaster}, ${STANDARD_NAMES.raidleader}, ${STANDARD_NAMES.raider}.`
    );
    return;
  }

  if (value === 'existing') {
    setState(interaction, { phase: 'existing', roles: {}, step: 0 });
    const firstRole = RAIDFLOW_ROLES[0];
    await interaction.update({
      content: `**Bestehende Rollen zuordnen** – Wähle die Rolle für **${RAIDFLOW_LABELS[firstRole]}**.`,
      components: [buildExistingRoleSelect(guild, firstRole)],
    });
    return;
  }

  if (value === 'custom') {
    const modal = new ModalBuilder()
      .setCustomId('rf_modal_custom_roles')
      .setTitle('Eigene Rollen anlegen')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('guildmaster')
            .setLabel('Name der Gildenmeister-Rolle')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('raidleader')
            .setLabel('Name der Raidleader-Rolle')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('raider')
            .setLabel('Name der Raider-Rolle')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)
        )
      );
    setState(interaction, { phase: 'custom_modal' });
    await interaction.showModal(modal);
    return;
  }
}

async function handleExistingRoleSelect(interaction, raidFlowRole, selectedValue) {
  const state = getState(interaction);
  const guild = interaction.guild;
  if (!state || state.phase !== 'existing') return;

  let roleId = selectedValue;
  if (selectedValue === 'new') {
    clearState(interaction);
    const modal = new ModalBuilder()
      .setCustomId(`rf_modal_existing_new_${raidFlowRole}`)
      .setTitle(`Neue Rolle für ${RAIDFLOW_LABELS[raidFlowRole]}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Name der neuen Rolle')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)
        )
      );
    setState(interaction, { phase: 'existing', roles: state.roles || {}, step: state.step, pendingNewRole: raidFlowRole });
    await interaction.showModal(modal);
    return;
  }

  const roles = { ...(state.roles || {}), [raidFlowRole]: roleId };
  const nextIndex = state.step + 1;
  if (nextIndex >= RAIDFLOW_ROLES.length) {
    await interaction.update({ content: 'Webapp wird aktualisiert…', components: [] }).catch(() => {});
    await applyGuildConfigAndFinish(
      interaction,
      roles,
      'RaidFlow-Setup abgeschlossen. Bestehende Rollen wurden zugeordnet.'
    );
    return;
  }
  setState(interaction, { phase: 'existing', roles, step: nextIndex });
  const nextRole = RAIDFLOW_ROLES[nextIndex];
  await interaction.update({
    content: `**Bestehende Rollen zuordnen** – Wähle die Rolle für **${RAIDFLOW_LABELS[nextRole]}**.`,
    components: [buildExistingRoleSelect(guild, nextRole)],
  });
}

async function handleModalExistingNewRole(interaction, raidFlowRole, name) {
  const state = getState(interaction);
  const guild = interaction.guild;
  const trimmed = name.trim();
  if (!trimmed) {
    await interaction.reply({ content: 'Bitte einen Rollennamen angeben.', ephemeral: true }).catch(() => {});
    return;
  }
  let role;
  try {
    role = await guild.roles.create({ name: trimmed, reason: 'RaidFlow Setup' });
  } catch (e) {
    await interaction.reply({ content: `Rolle konnte nicht erstellt werden: ${e.message}`, ephemeral: true }).catch(() => {});
    return;
  }
  const roles = { ...(state?.roles || {}), [raidFlowRole]: role.id };
  const step = state?.step ?? 0;
  const nextIndex = step + 1;
  if (nextIndex >= RAIDFLOW_ROLES.length) {
    await interaction.reply({ content: 'Webapp wird aktualisiert…', ephemeral: true }).catch(() => {});
    try {
      await callWebapp('/api/bot/guild', {
        discordGuildId: guild.id,
        name: guild.name,
        discordRoleGuildmasterId: roles.guildmaster,
        discordRoleRaidleaderId: roles.raidleader,
        discordRoleRaiderId: roles.raider,
      });
      clearState(interaction);
      await interaction.editReply('RaidFlow-Setup abgeschlossen. Rollen wurden angelegt und zugeordnet.').catch(() => {});
    } catch (e) {
      await interaction.editReply(`Fehler: ${e.message}`).catch(() => {});
    }
    return;
  }
  setState(interaction, { phase: 'existing', roles, step: nextIndex });
  const nextRole = RAIDFLOW_ROLES[nextIndex];
  await interaction.reply({
    content: `**Bestehende Rollen zuordnen** – Wähle die Rolle für **${RAIDFLOW_LABELS[nextRole]}**.`,
    components: [buildExistingRoleSelect(guild, nextRole)],
    ephemeral: true,
  }).catch(() => {});
}

async function handleModalCustomRoles(interaction, names) {
  const guild = interaction.guild;
  const created = {};
  try {
    for (const key of RAIDFLOW_ROLES) {
      const name = (names[key] || STANDARD_NAMES[key]).trim();
      const role = await guild.roles.create({ name, reason: 'RaidFlow Setup' });
      created[key] = role.id;
    }
  } catch (e) {
    await interaction.reply({ content: `Fehler beim Anlegen der Rollen: ${e.message}`, ephemeral: true }).catch(() => {});
    return;
  }
  await interaction.reply({ content: 'Webapp wird aktualisiert…', ephemeral: true }).catch(() => {});
  try {
    await callWebapp('/api/bot/guild', {
      discordGuildId: guild.id,
      name: guild.name,
      discordRoleGuildmasterId: created.guildmaster,
      discordRoleRaidleaderId: created.raidleader,
      discordRoleRaiderId: created.raider,
    });
    clearState(interaction);
    await interaction.editReply(
      'RaidFlow-Setup abgeschlossen. Deine Rollen wurden auf dem Server angelegt und in der Webapp gespeichert.'
    ).catch(() => {});
  } catch (e) {
    await interaction.editReply(`Fehler: ${e.message}`).catch(() => {});
  }
}

async function handleModalRename(interaction, roleKey, newName) {
  const state = getState(interaction);
  const cfg = state?.existingConfig;
  const guild = interaction.guild;
  const roleIdKey = roleKey === 'guildmaster' ? 'discordRoleGuildmasterId' : roleKey === 'raidleader' ? 'discordRoleRaidleaderId' : 'discordRoleRaiderId';
  const currentId = cfg?.[roleIdKey];
  if (!currentId) {
    await interaction.reply({ content: 'Konfiguration nicht gefunden.', ephemeral: true }).catch(() => {});
    return;
  }
  const role = guild.roles.cache.get(currentId);
  if (!role) {
    await interaction.reply({ content: 'Rolle auf dem Server nicht gefunden.', ephemeral: true }).catch(() => {});
    return;
  }
  const trimmed = newName.trim();
  if (!trimmed) {
    await interaction.reply({ content: 'Bitte einen Namen angeben.', ephemeral: true }).catch(() => {});
    return;
  }
  try {
    await role.setName(trimmed, 'RaidFlow Setup – Umbenennung');
  } catch (e) {
    await interaction.reply({ content: `Umbenennung fehlgeschlagen: ${e.message}`, ephemeral: true }).catch(() => {});
    return;
  }
  const updated = { ...cfg, [roleIdKey]: currentId };
  await interaction.reply({ content: 'Webapp wird aktualisiert…', ephemeral: true }).catch(() => {});
  try {
    await callWebapp('/api/bot/guild', {
      discordGuildId: guild.id,
      name: guild.name,
      discordRoleGuildmasterId: updated.discordRoleGuildmasterId,
      discordRoleRaidleaderId: updated.discordRoleRaidleaderId,
      discordRoleRaiderId: updated.discordRoleRaiderId,
    });
    clearState(interaction);
    await interaction.editReply(`Rolle wurde in „${trimmed}" umbenannt und die Konfiguration wurde gespeichert.`).catch(() => {});
  } catch (e) {
    await interaction.editReply(`Speichern fehlgeschlagen: ${e.message}`).catch(() => {});
  }
}

async function handleModalNewForChange(interaction, roleKey, name) {
  const state = getState(interaction);
  const cfg = state?.existingConfig;
  const guild = interaction.guild;
  const trimmed = name.trim();
  if (!trimmed) {
    await interaction.reply({ content: 'Bitte einen Rollennamen angeben.', ephemeral: true }).catch(() => {});
    return;
  }
  let role;
  try {
    role = await guild.roles.create({ name: trimmed, reason: 'RaidFlow Setup' });
  } catch (e) {
    await interaction.reply({ content: `Rolle konnte nicht erstellt werden: ${e.message}`, ephemeral: true }).catch(() => {});
    return;
  }
  const roleIdKey = roleKey === 'guildmaster' ? 'discordRoleGuildmasterId' : roleKey === 'raidleader' ? 'discordRoleRaidleaderId' : 'discordRoleRaiderId';
  const updated = { ...cfg, [roleIdKey]: role.id };
  await interaction.reply({ content: 'Webapp wird aktualisiert…', ephemeral: true }).catch(() => {});
  try {
    await callWebapp('/api/bot/guild', {
      discordGuildId: guild.id,
      name: guild.name,
      discordRoleGuildmasterId: updated.discordRoleGuildmasterId,
      discordRoleRaidleaderId: updated.discordRoleRaidleaderId,
      discordRoleRaiderId: updated.discordRoleRaiderId,
    });
    clearState(interaction);
    await interaction.editReply(`Neue Rolle „${trimmed}" wurde angelegt und für ${RAIDFLOW_LABELS[roleKey]} gespeichert.`).catch(() => {});
  } catch (e) {
    await interaction.editReply(`Speichern fehlgeschlagen: ${e.message}`).catch(() => {});
  }
}

async function handleChangeAssign(interaction, roleKey, selectedRoleId) {
  const state = getState(interaction);
  const cfg = state?.existingConfig;
  const guild = interaction.guild;
  const roleIdKey = roleKey === 'guildmaster' ? 'discordRoleGuildmasterId' : roleKey === 'raidleader' ? 'discordRoleRaidleaderId' : 'discordRoleRaiderId';
  const updated = { ...cfg, [roleIdKey]: selectedRoleId };
  await interaction.update({ content: 'Webapp wird aktualisiert…', components: [] }).catch(() => {});
  try {
    await callWebapp('/api/bot/guild', {
      discordGuildId: guild.id,
      name: guild.name,
      discordRoleGuildmasterId: updated.discordRoleGuildmasterId,
      discordRoleRaidleaderId: updated.discordRoleRaidleaderId,
      discordRoleRaiderId: updated.discordRoleRaiderId,
    });
    clearState(interaction);
    const roleName = guild.roles.cache.get(selectedRoleId)?.name ?? selectedRoleId;
    await interaction.editReply(`Die Rolle „${roleName}" wurde für ${RAIDFLOW_LABELS[roleKey]} gespeichert.`).catch(() => {});
  } catch (e) {
    await interaction.editReply(`Fehler: ${e.message}`).catch(() => {});
  }
}

// —— Slash-Command Handler ———————————————————————————————————————————————————
client.on('interactionCreate', async (interaction) => {
  // Help (nur Slash)
  if (interaction.isChatInputCommand() && interaction.commandName === 'raidflow') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'check') {
      if (!interaction.guild) {
        return interaction.reply({
          content: 'Dieser Befehl funktioniert nur auf einem Server (nicht in DMs).',
          ephemeral: true,
        });
      }
      await runRaidflowCheck(interaction);
      return;
    }
    if (sub === 'help') {
      if (!hasSetupPermission(interaction.member)) {
        return interaction.reply({
          content: 'Du hast keine Berechtigung. Nur Server-Gründer oder Nutzer mit „Server verwalten“ bzw. Administrator können RaidFlow-Befehle ausführen.',
          ephemeral: true,
        });
      }
      return interaction.reply({
        content: buildHelpContent(),
        ephemeral: true,
      });
    }
  }

  // Select-Menüs (Setup-Flow)
  if (interaction.isStringSelectMenu()) {
    const customId = interaction.customId;
    if (!customId.startsWith('rf_') || !hasSetupPermission(interaction.member)) return;
    const value = interaction.values[0];

    if (customId === 'rf_reconfigure') {
      await handleReconfigure(interaction, value);
      return;
    }
    if (customId === 'rf_setup_mode') {
      await handleSetupMode(interaction, value);
      return;
    }
    if (customId === 'rf_change_which') {
      await handleChangeWhich(interaction, value);
      return;
    }
    if (customId === 'rf_change_what') {
      await handleChangeWhat(interaction, value);
      return;
    }
    if (customId.startsWith('rf_existing_')) {
      const roleKey = customId.replace('rf_existing_', '');
      await handleExistingRoleSelect(interaction, roleKey, value);
      return;
    }
    if (customId.startsWith('rf_change_assign_')) {
      const roleKey = customId.replace('rf_change_assign_', '');
      await handleChangeAssign(interaction, roleKey, value);
      return;
    }
  }

  // Modals (Setup-Flow)
  if (interaction.isModalSubmit()) {
    const customId = interaction.customId;
    if (!customId.startsWith('rf_') || !hasSetupPermission(interaction.member)) return;

    if (customId === 'rf_modal_custom_roles') {
      const names = {
        guildmaster: interaction.fields.getTextInputValue('guildmaster'),
        raidleader: interaction.fields.getTextInputValue('raidleader'),
        raider: interaction.fields.getTextInputValue('raider'),
      };
      await handleModalCustomRoles(interaction, names);
      return;
    }
    if (customId.startsWith('rf_modal_existing_new_')) {
      const roleKey = customId.replace('rf_modal_existing_new_', '');
      const name = interaction.fields.getTextInputValue('name');
      await handleModalExistingNewRole(interaction, roleKey, name);
      return;
    }
    if (customId.startsWith('rf_modal_rename_')) {
      const roleKey = customId.replace('rf_modal_rename_', '');
      const name = interaction.fields.getTextInputValue('name');
      await handleModalRename(interaction, roleKey, name);
      return;
    }
    if (customId.startsWith('rf_modal_new_')) {
      const roleKey = customId.replace('rf_modal_new_', '');
      const name = interaction.fields.getTextInputValue('name');
      await handleModalNewForChange(interaction, roleKey, name);
      return;
    }
  }

  // Slash: setup & group
  if (!interaction.isChatInputCommand()) return;

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

  if (!hasSetupPermission(interaction.member)) {
    return interaction.reply({
      content: 'Du hast keine Berechtigung. Nur Server-Gründer oder Nutzer mit „Server verwalten“ bzw. Administrator können diesen Befehl ausführen.',
      ephemeral: true,
    });
  }

  if (sub === 'setup') {
    await runSetup(interaction);
    return;
  }

  if (sub === 'group') {
    const groupName = (groupNameRaw ?? interaction.options.getString('groupname', true))?.trim();
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
  console.error('DISCORD_BOT_TOKEN fehlt. Bitte in Railway/Vercel bzw. .env setzen.');
  process.exit(1);
}

if (USE_GUILD_MEMBERS_INTENT) {
  client.on('guildMemberAdd', (member) => {
    void pushMemberPermissionSync(member.guild.id, member.user.id, {
      roleIds: [...member.roles.cache.keys()],
      displayName: member.displayName ?? null,
    });
  });

  client.on('guildMemberRemove', (member) => {
    void pushMemberPermissionSync(member.guild.id, member.user.id, { left: true });
  });

  client.on('guildMemberUpdate', (_oldMember, newMember) => {
    void pushMemberPermissionSync(newMember.guild.id, newMember.user.id, {
      roleIds: [...newMember.roles.cache.keys()],
      displayName: newMember.displayName ?? null,
    });
  });
}

client.on('error', (err) => {
  console.error('Discord Client Error:', err);
});

client.login(token).catch((err) => {
  console.error('Login fehlgeschlagen (Token prüfen, Application aktiv?):', err.message);
  process.exit(1);
});
