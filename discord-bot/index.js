/**
 * RaidFlow Discord-Bot
 * Slash-Commands: /raidflow help, /raidflow home, /raidflow setup (Rollen + Battle.net), /raidflow group <groupname>
 * App Home: Primary-Entry-Command „start“ (DM-Dashboard, analog Web-Profil).
 * Rechte: Nur Server-Owner oder ADMINISTRATOR oder MANAGE_GUILD.
 * Gateway: optional GuildMembers (privileged). Nur nutzen, wenn im Discord Developer Portal
 * unter Bot → „Privileged Gateway Intents“ → **Server Members Intent** aktiviert ist **und**
 * die Umgebungsvariable DISCORD_GUILD_MEMBERS_INTENT=1 (oder true) gesetzt ist. Sonst Login-Fehler
 * „Used disallowed intents“. Ohne diesen Intent startet der Bot; Rollen-Sync läuft dann nur
 * über Bot-Events (`sync-member` o. ä.), nicht mehr über Webapp-Seitenaufrufe.
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
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { handleAppHomeInteraction, sendAppHome } from './app-home.js';

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

function truncateDiscordLabel(s, maxLen = 100) {
  const t = String(s ?? '').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
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

/**
 * POST /api/bot/sync-member — mit ausführlichem JSON-Log (Railway).
 * Kein throw: Fehler nur loggen, damit der Bot nicht abstürzt.
 */
async function pushMemberPermissionSync(guildDiscordId, discordUserId, payload) {
  const base = (process.env.WEBAPP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const url = `${base}/api/bot/sync-member`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getWebappHeaders(),
      },
      body: JSON.stringify({
        discordGuildId: guildDiscordId,
        discordUserId,
        ...payload,
      }),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* nicht JSON */
    }
    const line = {
      level: res.ok ? 'info' : 'error',
      scope: 'RF_MEMBER_SYNC',
      httpStatus: res.status,
      discordGuildId: guildDiscordId,
      discordUserId,
      left: payload.left === true,
      roleIdCount: Array.isArray(payload.roleIds) ? payload.roleIds.length : 0,
      skipped: json?.skipped === true,
      skipReason: json?.reason,
      apiError: json?.error,
    };
    console.log(JSON.stringify(line));
    if (!res.ok || json?.skipped) {
      console.log('[RF_MEMBER_SYNC] response body:', text.slice(0, 900));
    }
  } catch (e) {
    console.error(
      JSON.stringify({
        level: 'error',
        scope: 'RF_MEMBER_SYNC',
        discordGuildId: guildDiscordId,
        discordUserId,
        error: String(e?.message || e),
      })
    );
  }
}

/**
 * Webapp: POST /api/bot/sync-member mit fetchMemberFromDiscord — gleicher zentraler Sync wie bei Member-Events,
 * aber Rollen/Nick werden per Discord-API geladen (z. B. erste Bot-Interaktion ohne Webapp-Login / ohne Member-Intent-Events).
 */
async function syncRaidFlowMemberFromDiscord(discordGuildId, discordUserId) {
  if (!discordGuildId || !discordUserId) return;
  const base = (process.env.WEBAPP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const url = `${base}/api/bot/sync-member`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getWebappHeaders(),
      },
      body: JSON.stringify({
        discordGuildId,
        discordUserId,
        fetchMemberFromDiscord: true,
      }),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* nicht JSON */
    }
    if (!res.ok) {
      console.warn(
        JSON.stringify({
          scope: 'RF_MEMBER_FETCH_SYNC',
          httpStatus: res.status,
          discordGuildId,
          discordUserId,
          error: json?.error ?? text.slice(0, 240),
        })
      );
    }
  } catch (e) {
    console.error(
      JSON.stringify({
        scope: 'RF_MEMBER_FETCH_SYNC',
        discordGuildId,
        discordUserId,
        error: String(e?.message || e),
      })
    );
  }
}

const homeApiDeps = () => ({
  getWebappJson,
  callWebapp,
  syncRaidFlowMemberFromDiscord,
});

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
console.info(
  '[RaidFlow] Slash-Commands: neuen Subcommand sofort nutzen → GUILD_ID oder DISCORD_DEPLOY_GUILD_IDS (Server-Snowflake) in Railway setzen; sonst globale Updates bis ca. 1 h.'
);

// —— Help ———————————————————————————————————————————————————————————————————
function buildHelpContent() {
  return [
    '**RaidFlow – Befehle**',
    '',
    '**`/raidflow home`** – Home-Übersicht (Embeds, icon-lastig):',
    '• ✍️ **Deine Anmeldungen** + kurzer **Stats**-Block (mit Link zur Bearbeitung/Anmeldung)',
    '• 🗓️ **Anstehende Raids** (Dungeon, Termin, Anmeldungen) mit Link zur Anmeldung; als Raidleader zusätzlich ⚙️ Edit / 🧩 Plan',
    '• 🔗 Links: 📊 Dashboard, 👤 Profil, ➕ Neuer Raid (nur wenn möglich)',
    '',
    '**App Home** – Wenn du RaidFlow als **Nutzer-App** installiert hast, öffnet die **Start**-Schaltfläche dieselbe Home-Übersicht in den Direktnachrichten (Primary Entry Point).',
    '',
    '**`/raidflow help`** – Zeigt diese Übersicht aller Befehle.',
    '',
    '**`/raidflow setup`** – Server in RaidFlow einrichten. Du kannst wählen:',
    '• **Standardrollen anlegen** – Der Bot erstellt die Rollen Gildenmeister, Raidleader und Raider.',
    '• **Bestehende Rollen zuordnen** – Du wählst für jede RaidFlow-Rolle eine bestehende Discord-Rolle oder lässt eine neue anlegen.',
    '• **Eigene Rollen anlegen** – Du gibst für jede RaidFlow-Rolle einen Namen ein; der Bot legt die Rollen auf dem Server an.',
    '• **Battle.net-Gilde verknüpfen** – WoW-Version und **WoW-Server** wählen, dann Gildennamen (exakt wie im Spiel) – Verknüpfung speichern (nach vollständigem Rollen-Setup).',
    'Ist der Server bereits eingerichtet, kannst du Rollen löschen und neu einrichten, einzelne Rollen ändern oder Battle.net bearbeiten.',
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
          .setLabel('Battle.net-Gilde verknüpfen')
          .setDescription('Realm + Blizzard-Gilde suchen und in RaidFlow speichern')
          .setValue('bnet'),
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
          .setValue('custom'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Battle.net-Gilde verknüpfen')
          .setDescription('Gleiche Verknüpfung wie in der Webapp (Realm + Gildensuche)')
          .setValue('bnet')
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

function buildBnetVersionSelect(versions) {
  const list = Array.isArray(versions) ? versions : [];
  const options = list.slice(0, 25).map((v, i) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(truncateDiscordLabel(v))
      .setValue(String(i))
  );
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('rf_bnet_version_ix')
      .setPlaceholder('WoW-Version wählen (z. B. TBC Anniversary)')
      .addOptions(options)
  );
}

/** Wenn es in einer Version sehr viele Server gibt: vor dem Dropdown eingrenzen. */
function buildBnetServerFilterModal() {
  return new ModalBuilder()
    .setCustomId('rf_modal_bnet_server_filter')
    .setTitle('WoW-Server eingrenzen')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('q')
          .setLabel('Teil des Servernamens (z. B. Everlook)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Mindestens 2 Zeichen')
          .setRequired(true)
          .setMinLength(2)
          .setMaxLength(40)
      )
    );
}

function buildBnetGuildNameModal() {
  return new ModalBuilder()
    .setCustomId('rf_modal_bnet_guild_q')
    .setTitle('Gilde bei Blizzard suchen')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('guildName')
          .setLabel('Gildenname exakt wie im Spiel')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Leerzeichen, Bindestriche und Schreibweise beachten')
          .setRequired(true)
          .setMinLength(2)
          .setMaxLength(60)
      )
    );
}

function buildBnetManageSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('rf_bnet_manage')
      .setPlaceholder('Battle.net-Verknüpfung')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Neu verknüpfen / ändern')
          .setDescription('Realm + Gildensuche erneut durchlaufen')
          .setValue('new'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Verknüpfung entfernen')
          .setDescription('Battle.net-Zuordnung in RaidFlow löschen')
          .setValue('clear'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Fertig')
          .setDescription('Menü schließen')
          .setValue('done')
      )
  );
}

function buildBnetRealmSelectRows(realms) {
  const options = realms.slice(0, 25).map((r, i) => {
    const serverLabel = truncateDiscordLabel(r.name || r.label || r.slug);
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(serverLabel)
      .setValue(String(i));
    const desc = truncateDiscordLabel(`${r.region} · ${r.slug}`, 95);
    if (desc) opt.setDescription(desc);
    return opt;
  });
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('rf_bnet_realm_ix')
      .setPlaceholder('WoW-Server wählen')
      .addOptions(options)
  );
}

function buildBnetGuildSelectRows(hits) {
  const options = hits.slice(0, 25).map((h, i) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(truncateDiscordLabel(`${h.name} (${h.realmSlug})`))
      .setDescription(truncateDiscordLabel(`ID ${h.id}`, 95))
      .setValue(String(i))
  );
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('rf_bnet_guild_ix')
      .setPlaceholder('Treffer wählen')
      .addOptions(options)
  );
}

async function beginBnetSetup(interaction) {
  const discordGuildId = interaction.guild.id;
  let data;
  try {
    data = await getWebappJson('/api/bot/guild-battlenet-link', { discordGuildId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const notFound = /404/.test(msg);
    await interaction.update({
      content: notFound
        ? 'Dieser Discord-Server ist noch nicht in RaidFlow angelegt. Bitte zuerst die **RaidFlow-Rollen** einrichten (Standard, bestehend oder eigene).'
        : `Battle.net-Setup: Webapp-Fehler: ${msg}`,
      components: [],
    });
    return;
  }

  if (!data.rolesConfigured) {
    await interaction.update({
      content:
        'Die RaidFlow-Discord-Rollen fehlen noch. Bitte zuerst **Standardrollen**, **bestehende Rollen** oder **eigene Rollen** einrichten. Danach kannst du Battle.net verknüpfen.',
      components: [],
    });
    return;
  }

  setState(interaction, {
    phase: 'bnet',
    rfGuildId: data.guildId,
    battlenetGuildId: data.battlenetGuildId ?? null,
    battlenetGuildName: data.battlenetGuildName ?? null,
  });

  if (data.battlenetGuildId) {
    await interaction.update({
      content:
        `**Battle.net-Verknüpfung**\nAktuell: **${data.battlenetGuildName ?? '?'}** (Gilden-ID ${data.battlenetGuildId}).\n\nWas möchtest du tun?`,
      components: [buildBnetManageSelect()],
    });
    return;
  }

  await startBnetRealmFlow(interaction);
}

const BNET_GUILD_SPELLING_HINT =
  '**Hinweis:** Der Gildenname muss **exakt** zum Eintrag bei Blizzard passen (inkl. Leerzeichen, Bindestriche und Groß-/Kleinschreibung).';

async function startBnetRealmFlow(interaction) {
  let dataVers;
  try {
    dataVers = await getWebappJson('/api/bot/battlenet/realm-versions', {});
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await interaction
      .update({
        content: `WoW-Versionen konnten nicht geladen werden: ${msg}`,
        components: [],
      })
      .catch(() => {});
    return;
  }
  const versions = Array.isArray(dataVers.versions) ? dataVers.versions.filter(Boolean) : [];
  if (versions.length === 0) {
    await interaction
      .update({ content: 'Es sind keine WoW-Versionen in der Datenbank hinterlegt.', components: [] })
      .catch(() => {});
    return;
  }

  const prev = getState(interaction) || {};
  setState(interaction, { ...prev, phase: 'bnet', bnetVersions: versions });

  if (versions.length === 1) {
    await proceedBnetAfterVersion(interaction, versions[0]);
    return;
  }

  await interaction
    .update({
      content:
        '**Schritt 1 von 2:** Wähle die **WoW-Version** (z. B. Classic Era, TBC Anniversary, Mists …). Im nächsten Schritt wählst du den **WoW-Server**.',
      components: [buildBnetVersionSelect(versions)],
    })
    .catch(() => {});
}

async function proceedBnetAfterVersion(interaction, version) {
  const v = String(version ?? '').trim();
  if (!v) {
    await interaction.update({ content: 'Ungültige WoW-Version.', components: [] }).catch(() => {});
    return;
  }

  let data;
  try {
    data = await getWebappJson('/api/bot/battlenet/realms', { version: v, locale: 'de' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await interaction.update({ content: `Serverliste konnte nicht geladen werden: ${msg}`, components: [] }).catch(() => {});
    return;
  }

  const total = typeof data.total === 'number' ? data.total : 0;
  const truncated = data.truncated === true;
  const realms = Array.isArray(data.realms) ? data.realms : [];

  const prev = getState(interaction) || {};
  setState(interaction, { ...prev, phase: 'bnet', bnetPendingVersion: v, bnetSelectedVersion: v });

  if (truncated && realms.length === 0) {
    await interaction
      .update({
        content:
          `In der WoW-Version **„${v}"** gibt es **${total} WoW-Server** — zu viele für ein einzelnes Auswahlmenü.\n\n` +
          `Klicke auf **„WoW-Server eingrenzen“** und gib **mindestens 2 Zeichen** des **WoW-Servernamens** ein (z. B. „Everlook").`,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('rf_bnet_server_filter_btn')
              .setLabel('WoW-Server eingrenzen')
              .setStyle(ButtonStyle.Primary)
          ),
        ],
      })
      .catch(() => {});
    return;
  }

  if (!realms.length) {
    await interaction
      .update({
        content: `Für die Version „${v}" wurden keine WoW-Server gefunden (oder die Eingrenzung lieferte nichts).`,
        components: [],
      })
      .catch(() => {});
    return;
  }

  const st = getState(interaction) || {};
  setState(interaction, { ...st, phase: 'bnet', realmRows: realms, bnetSelectedVersion: v, bnetPendingVersion: null });
  await interaction
    .update({
      content: `**Schritt 2 von 2:** Wähle den **WoW-Server** (${realms.length} von ${total} Servern in dieser Version).`,
      components: [buildBnetRealmSelectRows(realms)],
    })
    .catch(() => {});
}

async function saveBnetGuildLink(interaction, realmRow, hit) {
  const discordGuildId = interaction.guild.id;
  await callWebapp('/api/bot/guild-battlenet-link', {
    discordGuildId,
    action: 'save',
    battlenetRealmId: realmRow.id,
    battlenetGuildId: hit.id,
    battlenetGuildName: hit.name,
    profileRealmSlug: hit.realmSlug || undefined,
    profileRealmId: hit.realmNumericId || undefined,
  });
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

  if (value === 'bnet') {
    await beginBnetSetup(interaction);
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

  if (value === 'bnet') {
    await beginBnetSetup(interaction);
    return;
  }

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
// =============================================================================
// Raid-Posting-Interaktionen (Buttons, Auswahl-Menüs, Modals)
// =============================================================================

function noDashToUuid(s) {
  if (!s || s.length !== 32) return s;
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/** Parst rf:<action>:<raidNoDash>:<guildNoDash> */
function parseRaidActionCustomId(customId) {
  const parts = customId.split(':');
  if (parts.length !== 4 || parts[0] !== 'rf') return null;
  return { action: parts[1], raidId: noDashToUuid(parts[2]), guildId: noDashToUuid(parts[3]) };
}

/** Parst rfm:<action>:<raidNoDash>[:<charNoDash>] */
function parseRaidModalCustomId(customId) {
  const parts = customId.split(':');
  if (parts[0] !== 'rfm') return null;
  return {
    action: parts[1],
    raidId: noDashToUuid(parts[2]),
    charId: parts[3] ? noDashToUuid(parts[3]) : null,
  };
}

async function callDiscordAction(body) {
  const base = (process.env.WEBAPP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const res = await fetch(`${base}/api/bot/discord-action`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...getWebappHeaders() },
    body:    JSON.stringify(body),
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, json };
}

async function getDiscordAction(params) {
  const base = (process.env.WEBAPP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const qs = new URLSearchParams(params);
  const res = await fetch(`${base}/api/bot/discord-action?${qs}`, { headers: getWebappHeaders() });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, json };
}

function raidActionErrorText(err) {
  const map = {
    NOT_LINKED:      '❌ Dein Discord-Konto ist noch nicht mit RaidFlow verknüpft. Nutze `/raidflow home` um dein Konto zu verbinden.',
    NO_CHARACTER:    '❌ Kein Charakter für diese Gilde gefunden. Bitte erst einen Charakter anlegen.',
    ALREADY_SIGNED_UP: '⚠️ Du bist bereits angemeldet.',
    SIGNUP_CLOSED:   '🔒 Die Anmeldung ist geschlossen oder der Raid nicht mehr offen.',
    NOT_SIGNED_UP:   '⚠️ Du hast keine aktive Anmeldung.',
    REASON_REQUIRED: '⚠️ Nach dem Anmeldeschluss ist eine Begründung für die Abmeldung erforderlich.',
  };
  return map[err] ?? `❌ Fehler: ${String(err)}`;
}

// --- Button-Handler ----------------------------------------------------------

async function handleRaidQuickjoin(interaction, raidId) {
  await interaction.deferReply({ ephemeral: true }).catch(() => {});
  const { ok, json } = await callDiscordAction({
    action:        'quickjoin',
    discordUserId: interaction.user.id,
    raidId,
  });
  const msg = ok
    ? `⚡ ${json.message ?? 'Quickjoin erfolgreich!'}`
    : raidActionErrorText(json.error);
  await interaction.editReply({ content: msg }).catch(() => {});
}

async function showJoinModal(interaction, raidId, char) {
  const {
    ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  } = await import('discord.js');
  const raidNoDash = raidId.replace(/-/g, '');
  const charNoDash = char.id.replace(/-/g, '');
  const modal = new ModalBuilder()
    .setCustomId(`rfm:join:${raidNoDash}:${charNoDash}`)
    .setTitle(`Anmeldung: ${truncateDiscordLabel(char.name, 50)}`);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('type').setLabel('Anmelde-Typ')
        .setStyle(TextInputStyle.Short).setValue('normal')
        .setPlaceholder('normal · ungewiss · reserve').setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('signedSpec').setLabel('Spec (leer = Main-Spec)')
        .setStyle(TextInputStyle.Short).setValue(char.mainSpec ?? '')
        .setPlaceholder(char.mainSpec || 'Spec eintragen').setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('punctuality').setLabel('Pünktlichkeit')
        .setStyle(TextInputStyle.Short).setValue('on_time')
        .setPlaceholder('on_time · tight · late').setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('note').setLabel('Notiz (bei "late" Pflicht)')
        .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)
    ),
  );
  await interaction.showModal(modal).catch(() => {});
}

async function handleRaidJoinButton(interaction, raidId, guildId) {
  const { ok, json } = await getDiscordAction({
    action: 'get-chars', discordUserId: interaction.user.id, raidId,
  });
  if (!ok || !json.linked) {
    await interaction.reply({ content: raidActionErrorText('NOT_LINKED'), ephemeral: true }).catch(() => {});
    return;
  }
  const chars = Array.isArray(json.characters) ? json.characters : [];
  if (chars.length === 0) {
    await interaction.reply({ content: raidActionErrorText('NO_CHARACTER'), ephemeral: true }).catch(() => {});
    return;
  }
  if (chars.length === 1) {
    await showJoinModal(interaction, raidId, chars[0]);
    return;
  }
  // Mehrere Chars → Select-Menü
  const { StringSelectMenuBuilder, ActionRowBuilder } = await import('discord.js');
  const raidNoDash  = raidId.replace(/-/g, '');
  const guildNoDash = guildId.replace(/-/g, '');
  const select = new StringSelectMenuBuilder()
    .setCustomId(`rf:selchar:${raidNoDash}:${guildNoDash}`)
    .setPlaceholder('Charakter auswählen…')
    .addOptions(
      chars.slice(0, 25).map(c => ({
        label:       truncateDiscordLabel(`${c.name} (${c.mainSpec})`, 100),
        value:       c.id,
        description: c.isMain ? 'Hauptcharakter' : 'Twink',
        default:     c.isMain === true,
      }))
    );
  await interaction.reply({
    content:    '**Welchen Charakter möchtest du anmelden?**',
    components: [new ActionRowBuilder().addComponents(select)],
    ephemeral:  true,
  }).catch(() => {});
}

async function handleRaidEditButton(interaction, raidId) {
  const { ok, json } = await getDiscordAction({
    action: 'get-signup', discordUserId: interaction.user.id, raidId,
  });
  if (!ok || !json.linked) {
    await interaction.reply({ content: raidActionErrorText('NOT_LINKED'), ephemeral: true }).catch(() => {});
    return;
  }
  if (!json.signup) {
    await interaction.reply({ content: '⚠️ Du hast keine aktive Anmeldung zum Bearbeiten.', ephemeral: true }).catch(() => {});
    return;
  }
  const signup = json.signup;
  const char   = signup.character;
  const {
    ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  } = await import('discord.js');
  const modal = new ModalBuilder()
    .setCustomId(`rfm:edit:${raidId.replace(/-/g, '')}`)
    .setTitle(`Anmeldung bearbeiten${char ? ': ' + truncateDiscordLabel(char.name, 40) : ''}`);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('type').setLabel('Anmelde-Typ')
        .setStyle(TextInputStyle.Short).setValue(signup.type ?? 'normal')
        .setPlaceholder('normal · ungewiss · reserve').setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('signedSpec').setLabel('Spec')
        .setStyle(TextInputStyle.Short)
        .setValue(signup.signedSpec ?? char?.mainSpec ?? '')
        .setPlaceholder(char?.mainSpec || 'Spec eintragen').setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('punctuality').setLabel('Pünktlichkeit')
        .setStyle(TextInputStyle.Short).setValue(signup.punctuality ?? 'on_time')
        .setPlaceholder('on_time · tight · late').setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('note').setLabel('Notiz')
        .setStyle(TextInputStyle.Paragraph).setValue(signup.note ?? '')
        .setRequired(false).setMaxLength(500)
    ),
  );
  await interaction.showModal(modal).catch(() => {});
}

async function handleRaidUnregButton(interaction, raidId) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
  const modal = new ModalBuilder()
    .setCustomId(`rfm:unreg:${raidId.replace(/-/g, '')}`)
    .setTitle('Abmeldung bestätigen');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('reason').setLabel('Begründung (Pflicht nach Anmeldeschluss)')
        .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)
        .setPlaceholder('z. B. „Krankheit", „Arbeit" …')
    ),
  );
  await interaction.showModal(modal).catch(() => {});
}

// --- Select-Menü-Handler ----------------------------------------------------

async function handleRaidCharSelect(interaction, raidId) {
  const charId = interaction.values?.[0];
  if (!charId) {
    await interaction.reply({ content: '❌ Keine Auswahl.', ephemeral: true }).catch(() => {});
    return;
  }
  const { ok, json } = await getDiscordAction({
    action: 'get-chars', discordUserId: interaction.user.id, raidId,
  });
  const chars = ok && Array.isArray(json.characters) ? json.characters : [];
  const char = chars.find(c => c.id === charId) ?? { id: charId, name: '?', mainSpec: '' };
  await showJoinModal(interaction, raidId, char);
}

// --- Modal-Handler ----------------------------------------------------------

async function handleRaidJoinModal(interaction, raidId, charId) {
  await interaction.deferReply({ ephemeral: true }).catch(() => {});
  const type        = interaction.fields.getTextInputValue('type').trim()        || 'normal';
  const signedSpec  = interaction.fields.getTextInputValue('signedSpec').trim();
  const punctuality = interaction.fields.getTextInputValue('punctuality').trim() || 'on_time';
  const note        = interaction.fields.getTextInputValue('note').trim();

  const { ok, json } = await callDiscordAction({
    action: 'join', discordUserId: interaction.user.id, raidId, characterId: charId,
    type, signedSpec: signedSpec || undefined, punctuality, note,
  });
  await interaction.editReply({
    content: ok ? `✅ ${json.message ?? 'Anmeldung erfolgreich!'}` : raidActionErrorText(json.error),
  }).catch(() => {});
}

async function handleRaidEditModal(interaction, raidId) {
  await interaction.deferReply({ ephemeral: true }).catch(() => {});
  const { ok: getOk, json: getJson } = await getDiscordAction({
    action: 'get-signup', discordUserId: interaction.user.id, raidId,
  });
  const charId = getJson?.signup?.character?.id;
  if (!getOk || !charId) {
    await interaction.editReply({ content: '⚠️ Anmeldung nicht gefunden. Bitte zuerst anmelden.' }).catch(() => {});
    return;
  }
  const type        = interaction.fields.getTextInputValue('type').trim()        || 'normal';
  const signedSpec  = interaction.fields.getTextInputValue('signedSpec').trim();
  const punctuality = interaction.fields.getTextInputValue('punctuality').trim() || 'on_time';
  const note        = interaction.fields.getTextInputValue('note').trim();

  const { ok, json } = await callDiscordAction({
    action: 'edit-signup', discordUserId: interaction.user.id, raidId, characterId: charId,
    type, signedSpec: signedSpec || undefined, punctuality, note,
  });
  await interaction.editReply({
    content: ok ? `✅ ${json.message ?? 'Anmeldung aktualisiert!'}` : raidActionErrorText(json.error),
  }).catch(() => {});
}

async function handleRaidUnregModal(interaction, raidId) {
  await interaction.deferReply({ ephemeral: true }).catch(() => {});
  const reason = interaction.fields.getTextInputValue('reason').trim();
  const { ok, json } = await callDiscordAction({
    action: 'unregister', discordUserId: interaction.user.id, raidId, reason,
  });
  await interaction.editReply({
    content: ok ? `✅ ${json.message ?? 'Abmeldung erfolgreich.'}` : raidActionErrorText(json.error),
  }).catch(() => {});
}

// =============================================================================
// interactionCreate
// =============================================================================

client.on('interactionCreate', async (interaction) => {
  const homeHandled = await handleAppHomeInteraction(interaction, homeApiDeps());
  if (homeHandled) return;

  if (interaction.isButton()) {
    const bid = interaction.customId;
    if (bid === 'rf_bnet_server_filter_btn') {
      if (!hasSetupPermission(interaction.member)) {
        return interaction.reply({ content: 'Keine Berechtigung.', ephemeral: true }).catch(() => {});
      }
      const st = getState(interaction);
      if (!st?.bnetPendingVersion) {
        return interaction.reply({ content: 'Sitzung abgelaufen. Bitte `/raidflow setup` erneut starten.', ephemeral: true }).catch(() => {});
      }
      await interaction.showModal(buildBnetServerFilterModal()).catch(() => {});
      return;
    }
    // Raid-Action-Buttons (rf:<action>:<raidNoDash>:<guildNoDash>)
    if (bid.startsWith('rf:')) {
      const parsed = parseRaidActionCustomId(bid);
      if (parsed) {
        try {
          if (parsed.action === 'qj')    { await handleRaidQuickjoin(interaction, parsed.raidId); return; }
          if (parsed.action === 'join')  { await handleRaidJoinButton(interaction, parsed.raidId, parsed.guildId); return; }
          if (parsed.action === 'edit')  { await handleRaidEditButton(interaction, parsed.raidId); return; }
          if (parsed.action === 'unreg') { await handleRaidUnregButton(interaction, parsed.raidId); return; }
        } catch (e) {
          console.error('[RaidButton]', bid, e);
          await interaction.reply({ content: '❌ Interner Fehler.', ephemeral: true }).catch(() => {});
        }
        return;
      }
    }
  }

  // Help (nur Slash)
  if (interaction.isChatInputCommand() && interaction.commandName === 'raidflow') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'home') {
      await sendAppHome(interaction, homeApiDeps());
      return;
    }
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

  // Select-Menüs (Setup-Flow + Raid-Aktionen)
  if (interaction.isStringSelectMenu()) {
    const customId = interaction.customId;
    // Charakter-Auswahl für Raid-Anmeldung
    if (customId.startsWith('rf:selchar:')) {
      const parts  = customId.split(':');
      const raidId = noDashToUuid(parts[2]);
      try {
        await handleRaidCharSelect(interaction, raidId);
      } catch (e) {
        console.error('[RaidCharSelect]', customId, e);
        await interaction.reply({ content: '❌ Interner Fehler.', ephemeral: true }).catch(() => {});
      }
      return;
    }
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
    if (customId === 'rf_bnet_manage') {
      if (value === 'done') {
        clearState(interaction);
        await interaction.update({ content: 'Battle.net-Menü geschlossen.', components: [] }).catch(() => {});
        return;
      }
      if (value === 'clear') {
        await interaction.deferUpdate().catch(() => {});
        try {
          await callWebapp('/api/bot/guild-battlenet-link', {
            discordGuildId: interaction.guild.id,
            action: 'clear',
          });
          clearState(interaction);
          await interaction.editReply({ content: 'Battle.net-Verknüpfung wurde entfernt.', components: [] }).catch(() => {});
        } catch (e) {
          await interaction
            .editReply({ content: `Verknüpfung konnte nicht entfernt werden: ${e.message}`, components: [] })
            .catch(() => {});
        }
        return;
      }
      if (value === 'new') {
        await startBnetRealmFlow(interaction).catch(() => {});
        return;
      }
      return;
    }
    if (customId === 'rf_bnet_version_ix') {
      const state = getState(interaction);
      const versions = state?.bnetVersions;
      if (!versions?.length) {
        await interaction.reply({ content: 'Sitzung abgelaufen. Bitte `/raidflow setup` erneut starten.', ephemeral: true }).catch(() => {});
        return;
      }
      const ix = parseInt(value, 10);
      const version = versions[ix];
      if (version == null || version === '') {
        await interaction.reply({ content: 'Ungültige Auswahl.', ephemeral: true }).catch(() => {});
        return;
      }
      await proceedBnetAfterVersion(interaction, version);
      return;
    }
    if (customId === 'rf_bnet_realm_ix') {
      const state = getState(interaction);
      const rows = state?.realmRows;
      if (!rows?.length) {
        await interaction.reply({ content: 'Sitzung abgelaufen. Bitte `/raidflow setup` erneut starten.', ephemeral: true }).catch(() => {});
        return;
      }
      const ix = parseInt(value, 10);
      const realm = rows[ix];
      if (!realm) {
        await interaction.reply({ content: 'Ungültige Auswahl.', ephemeral: true }).catch(() => {});
        return;
      }
      setState(interaction, { ...state, phase: 'bnet', selectedRealm: realm });
      await interaction.showModal(buildBnetGuildNameModal()).catch(() => {});
      return;
    }
    if (customId === 'rf_bnet_guild_ix') {
      const state = getState(interaction);
      const hits = state?.guildHits;
      const realm = state?.selectedRealm;
      if (!hits?.length || !realm) {
        await interaction
          .reply({ content: 'Sitzung abgelaufen. Bitte `/raidflow setup` erneut starten.', ephemeral: true })
          .catch(() => {});
        return;
      }
      const ix = parseInt(value, 10);
      const hit = hits[ix];
      if (!hit) {
        await interaction.reply({ content: 'Ungültige Auswahl.', ephemeral: true }).catch(() => {});
        return;
      }
      await interaction.deferUpdate().catch(() => {});
      try {
        await saveBnetGuildLink(interaction, realm, hit);
        clearState(interaction);
        await interaction
          .editReply({
            content: `Battle.net-Verknüpfung gespeichert: **${hit.name}** (ID ${hit.id}) auf **${realm.name ?? realm.label ?? 'Server'}**.`,
            components: [],
          })
          .catch(() => {});
      } catch (e) {
        await interaction.editReply({ content: `Speichern fehlgeschlagen: ${e.message}`, components: [] }).catch(() => {});
      }
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
    // Raid-Modals (rfm:<action>:<raidNoDash>[:<charNoDash>])
    if (customId.startsWith('rfm:')) {
      const parsed = parseRaidModalCustomId(customId);
      if (parsed) {
        try {
          if (parsed.action === 'join')  { await handleRaidJoinModal(interaction, parsed.raidId, parsed.charId); return; }
          if (parsed.action === 'edit')  { await handleRaidEditModal(interaction, parsed.raidId); return; }
          if (parsed.action === 'unreg') { await handleRaidUnregModal(interaction, parsed.raidId); return; }
        } catch (e) {
          console.error('[RaidModal]', customId, e);
          await interaction.reply({ content: '❌ Interner Fehler beim Verarbeiten.', ephemeral: true }).catch(() => {});
        }
      }
      return;
    }
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
    if (customId === 'rf_modal_bnet_server_filter') {
      const q = interaction.fields.getTextInputValue('q').trim();
      if (q.length < 2) {
        await interaction.reply({ content: 'Bitte mindestens 2 Zeichen eingeben.', ephemeral: true }).catch(() => {});
        return;
      }
      const state = getState(interaction);
      const version = state?.bnetPendingVersion;
      if (!version) {
        await interaction.reply({ content: 'Sitzung abgelaufen. Bitte `/raidflow setup` erneut starten.', ephemeral: true }).catch(() => {});
        return;
      }
      let data;
      try {
        data = await getWebappJson('/api/bot/battlenet/realms', { version, q, locale: 'de' });
      } catch (e) {
        await interaction
          .reply({
            content: `WoW-Server konnten nicht geladen werden: ${e instanceof Error ? e.message : String(e)}`,
            ephemeral: true,
          })
          .catch(() => {});
        return;
      }
      const realms = Array.isArray(data.realms) ? data.realms : [];
      if (realms.length === 0) {
        await interaction
          .reply({
            ephemeral: true,
            content: `Keinen **WoW-Server** gefunden für „${q}" in der Version „${version}". Probiere einen anderen Teil des Servernamens.`,
          })
          .catch(() => {});
        return;
      }
      const prev = getState(interaction) || {};
      setState(interaction, {
        ...prev,
        phase: 'bnet',
        realmRows: realms,
        bnetPendingVersion: null,
        bnetSelectedVersion: version,
      });
      await interaction
        .reply({
          ephemeral: true,
          content: `**WoW-Server wählen** (${realms.length} Treffer nach „${q}“ in „${version}"):`,
          components: [buildBnetRealmSelectRows(realms)],
        })
        .catch(() => {});
      return;
    }
    if (customId === 'rf_modal_bnet_guild_q') {
      const state = getState(interaction);
      const realm = state?.selectedRealm;
      if (!realm?.id) {
        await interaction.reply({ content: 'Sitzung abgelaufen. Bitte von vorn beginnen.', ephemeral: true }).catch(() => {});
        return;
      }
      const gq = interaction.fields.getTextInputValue('guildName').trim();
      if (gq.length < 2) {
        await interaction.reply({ content: 'Bitte mindestens 2 Zeichen für die Gildensuche.', ephemeral: true }).catch(() => {});
        return;
      }
      let hits;
      try {
        const res = await callWebapp('/api/bot/battlenet/resolve-guild', {
          realmId: realm.id,
          query: gq,
          mode: 'search',
        });
        hits = Array.isArray(res.results) ? res.results : [];
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        await interaction
          .reply({
            ephemeral: true,
            content: `Gildensuche fehlgeschlagen:\n${detail}\n\n${BNET_GUILD_SPELLING_HINT}`,
          })
          .catch(() => {});
        return;
      }
      if (hits.length === 0) {
        await interaction
          .reply({
            ephemeral: true,
            content: `Keine Gilde gefunden.\n\n${BNET_GUILD_SPELLING_HINT}\n\nTipp: Name **genau** wie im Spiel eingeben (inkl. Leerzeichen und Bindestriche).`,
          })
          .catch(() => {});
        return;
      }
      if (hits.length === 1) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        try {
          await saveBnetGuildLink(interaction, realm, hits[0]);
          clearState(interaction);
          await interaction
            .editReply({
              content: `Battle.net-Verknüpfung gespeichert: **${hits[0].name}** (ID ${hits[0].id}) auf **${realm.name ?? realm.label ?? 'WoW-Server'}**.`,
            })
            .catch(() => {});
        } catch (e) {
          await interaction.editReply({ content: `Speichern fehlgeschlagen: ${e.message}` }).catch(() => {});
        }
        return;
      }
      const shown = hits.slice(0, 25);
      setState(interaction, { ...state, phase: 'bnet', guildHits: shown });
      await interaction
        .reply({
          ephemeral: true,
          content: `**Gilde wählen** (${hits.length} Treffer${hits.length > 25 ? ', es werden die ersten 25 angezeigt' : ''}):`,
          components: [buildBnetGuildSelectRows(shown)],
        })
        .catch(() => {});
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

  client.on('guildMemberUpdate', async (_oldMember, newMember) => {
    try {
      const fresh = await newMember.fetch();
      void pushMemberPermissionSync(fresh.guild.id, fresh.user.id, {
        roleIds: [...fresh.roles.cache.keys()],
        displayName: fresh.displayName ?? null,
      });
    } catch (e) {
      void pushMemberPermissionSync(newMember.guild.id, newMember.user.id, {
        roleIds: [...newMember.roles.cache.keys()],
        displayName: newMember.displayName ?? null,
      });
      console.error(
        JSON.stringify({
          scope: 'RF_MEMBER_SYNC',
          step: 'guildMemberUpdate_fetch_fallback',
          error: String(e?.message || e),
        })
      );
    }
  });
}

client.on('error', (err) => {
  console.error('Discord Client Error:', err);
});

client.login(token).catch((err) => {
  console.error('Login fehlgeschlagen (Token prüfen, Application aktiv?):', err.message);
  process.exit(1);
});
