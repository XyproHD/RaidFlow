/**
 * RaidFlow Discord-Bot
 * Slash-Commands: /raidflow help, /raidflow setup, /raidflow group <groupname>, /raidflow sync
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
  MessageFlags,
} from 'discord.js';
import { handleAppHomeInteraction } from './app-home.js';
import { scheduleRaidPostReconcile } from './raid-post-reconcile.js';
import {
  botLocale,
  puncLabels,
  raidActionErrorText,
  raidBotMessage,
  raidToolsErrorText,
  typeLabels,
} from './raid-bot-i18n.js';
import {
  getHelpTopicContent,
  helpLangLabel,
} from './raid-bot-help.js';
import {
  startCharOnboarding,
  handleCharOnboardingOpenModal,
  handleCharOnboardingCancel,
  handleCharOnboardingNameModal,
  handleCharOnboardingSpecSelect,
  handleCharOnboardingConfirm,
} from './char-onboarding.js';

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
const SETUP_EPHEMERAL_TTL_MS = 20 * 1000;

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

function scheduleDeleteSetupReply(interaction) {
  setTimeout(() => interaction.deleteReply().catch(() => {}), SETUP_EPHEMERAL_TTL_MS);
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

function charOnboardingDeps() {
  return {
    getWebappHeaders,
    restoreRaidPostComponents,
    scheduleDeleteSingleEphemeralReply,
    fetchRaidParticipantState,
    callDiscordAction,
    continueRaidJoinFlow,
    triggerRaidPostReconcile,
    botLocale,
    raidBotMessage,
    raidActionErrorText,
    raidPostMessages,
  };
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

/** Server-Berechtigungen, die RaidFlow laut lib/bot-invite.ts benötigt. */
const RAIDFLOW_BOT_GUILD_PERMISSIONS = [
  ['Rollen verwalten', PermissionFlagsBits.ManageRoles],
  ['Channels sehen', PermissionFlagsBits.ViewChannel],
  ['Nachrichten senden', PermissionFlagsBits.SendMessages],
  ['Nachrichtenverlauf lesen', PermissionFlagsBits.ReadMessageHistory],
  ['Slash-Commands', PermissionFlagsBits.UseApplicationCommands],
  ['Threads verwalten', PermissionFlagsBits.ManageThreads],
  ['Öffentliche Threads erstellen', PermissionFlagsBits.CreatePublicThreads],
  ['In Threads schreiben', PermissionFlagsBits.SendMessagesInThreads],
];

/** Pro erlaubtem Channel (Raid-Threads / Embeds). */
const RAIDFLOW_BOT_CHANNEL_PERMISSIONS = [
  ['Sehen', PermissionFlagsBits.ViewChannel],
  ['Senden', PermissionFlagsBits.SendMessages],
  ['Verlauf lesen', PermissionFlagsBits.ReadMessageHistory],
  ['Threads erstellen', PermissionFlagsBits.CreatePublicThreads],
  ['In Threads schreiben', PermissionFlagsBits.SendMessagesInThreads],
  ['Threads verwalten', PermissionFlagsBits.ManageThreads],
];

function formatBotGuildPermissionLines(botMember) {
  if (!botMember) {
    return { lines: ['• Bot-Mitglied auf diesem Server nicht geladen'], allOk: false, missing: [] };
  }
  const lines = [];
  const missing = [];
  for (const [label, flag] of RAIDFLOW_BOT_GUILD_PERMISSIONS) {
    const has = botMember.permissions.has(flag);
    lines.push(`• ${label}: **${has ? 'ja' : 'fehlt'}**`);
    if (!has) missing.push(label);
  }
  return { lines, allOk: missing.length === 0, missing };
}

async function formatAllowedChannelPermissionLines(guild, botMember, allowedChannels) {
  if (!allowedChannels?.length) {
    return ['_(keine Channels in der Gildenverwaltung hinterlegt)_'];
  }
  if (!botMember) {
    return ['_(Bot-Mitglied nicht geladen – Channel-Check nicht möglich)_'];
  }

  const lines = [];
  for (const row of allowedChannels) {
    const channelId = row.discordChannelId;
    const displayName = row.name?.trim()
      ? `#${row.name.trim()}`
      : `\`${channelId}\``;

    let channel = guild.channels.cache.get(channelId) ?? null;
    if (!channel) {
      try {
        channel = await guild.channels.fetch(channelId);
      } catch {
        channel = null;
      }
    }

    if (!channel) {
      lines.push(`• ${displayName}: **nicht gefunden** (gelöscht oder kein Zugriff)`);
      continue;
    }

    const perms = channel.permissionsFor(botMember);
    if (!perms) {
      lines.push(`• ${displayName}: **Berechtigungen nicht ermittelbar**`);
      continue;
    }

    const missing = RAIDFLOW_BOT_CHANNEL_PERMISSIONS.filter(([, flag]) => !perms.has(flag)).map(
      ([label]) => label
    );
    if (missing.length === 0) {
      lines.push(`• ${displayName}: **ok**`);
    } else {
      lines.push(`• ${displayName}: **fehlt:** ${missing.join(', ')}`);
    }
  }
  return lines;
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

    let botMember = guild.members.me;
    try {
      botMember = await guild.members.fetchMe();
    } catch {
      /* guild.members.me */
    }

    const g = data.rfGuild;
    const gmId = g?.discordRoleGuildmasterId;
    const rlId = g?.discordRoleRaidleaderId;
    const rdId = g?.discordRoleRaiderId;

    const guildPermCheck = formatBotGuildPermissionLines(botMember);
    const allowedChannelLines = await formatAllowedChannelPermissionLines(
      guild,
      botMember,
      g?.allowedChannels ?? []
    );

    const lines = [];
    lines.push('**RaidFlow – Status-Check**');
    lines.push('');
    lines.push('**Webapp / Datenbank**');
    lines.push(`• Server in DB: **${data.guildInDatabase ? 'ja' : 'nein'}**`);
    lines.push(`• Mindestrollen in DB vollständig: **${g?.minimumRolesConfigured ? 'ja' : 'nein'}**`);
    lines.push(`• App-Config (Server erlaubt): **${data.allowedByAppConfig ? 'ja' : 'nein'}**`);
    if (g) lines.push(`• Raidgruppen in DB: **${g.raidGroupCount}**`);
    if (g) {
      lines.push(
        `• Erlaubte Channels (Gildenverwaltung): **${(g.allowedChannels ?? []).length}**`
      );
    }
    lines.push('');
    lines.push('**Bot-Berechtigungen (Server)**');
    lines.push(...guildPermCheck.lines);
    lines.push('');
    lines.push('**Erlaubte Channels (Bot-Zugriff)**');
    lines.push(...allowedChannelLines);
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

    const botHints = [];
    if (!guildPermCheck.allOk) {
      botHints.push(
        `Bot fehlen Server-Berechtigungen: ${guildPermCheck.missing.join(', ')}. Bot erneut einladen oder Rolle anpassen.`
      );
    }
    if ((g?.allowedChannels ?? []).length > 0) {
      const channelIssues = allowedChannelLines.filter(
        (l) => !l.includes('**ok**') && !l.startsWith('_(')
      );
      if (channelIssues.length > 0) {
        botHints.push(
          `${channelIssues.length} erlaubte(r) Channel(s) sind für den Bot nicht voll nutzbar – siehe Abschnitt „Erlaubte Channels“.`
        );
      }
    } else if (g) {
      botHints.push(
        'Keine erlaubten Channels in der Gildenverwaltung hinterlegt – beim Raid anlegen kann kein Discord-Channel gewählt werden.'
      );
    }
    if (botHints.length) {
      if (!data.hints?.length) {
        lines.push('');
        lines.push('**Hinweise**');
      }
      for (const h of botHints) lines.push(`• ${h}`);
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
    return {
      ok: res.ok,
      skipped: json?.skipped === true,
      status: res.status,
      reason: json?.reason ?? null,
      error: json?.error ?? null,
    };
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
    return {
      ok: false,
      skipped: false,
      status: 0,
      reason: null,
      error: String(e?.message || e),
    };
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

function isRaidflowGuildLeadRole(role) {
  return role === 'guildmaster' || role === 'raidleader';
}

async function runGuildMemberRoleSync(guild) {
  const members = await guild.members.fetch();
  const entries = [...members.values()];
  let synced = 0;
  let skipped = 0;
  let failed = 0;

  const chunkSize = 20;
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map((member) =>
        pushMemberPermissionSync(guild.id, member.user.id, {
          roleIds: [...member.roles.cache.keys()],
          displayName: member.displayName ?? null,
          existingUsersOnly: true,
        })
      )
    );
    for (const r of results) {
      if (r.ok && !r.skipped) synced += 1;
      else if (r.skipped) skipped += 1;
      else failed += 1;
    }
  }

  return { total: entries.length, synced, skipped, failed };
}

function formatSyncSummaryText(syncResult) {
  return `Sync: ${syncResult.synced}/${syncResult.total} synchronisiert` +
    `${syncResult.skipped ? `, ${syncResult.skipped} übersprungen` : ''}` +
    `${syncResult.failed ? `, ${syncResult.failed} fehlgeschlagen` : ''}.`;
}

async function getRequesterRaidflowRole(interaction) {
  const data = await getWebappJson('/api/bot/guild-check', {
    discordGuildId: interaction.guild.id,
    discordUserId: interaction.user.id,
  });
  return {
    guildInDatabase: data.guildInDatabase === true,
    minimumRolesConfigured: data?.rfGuild?.minimumRolesConfigured === true,
    role: data?.user?.rfUserGuildRole ?? null,
  };
}

async function runManualGuildSync(interaction) {
  await interaction.deferReply({ ephemeral: true }).catch(() => {});
  try {
    const roleProbe = await getRequesterRaidflowRole(interaction);
    if (!roleProbe.guildInDatabase || !roleProbe.minimumRolesConfigured) {
      await interaction.editReply('Der Server ist noch nicht vollständig eingerichtet. Bitte zuerst `/raidflow setup` ausführen.').catch(() => {});
      scheduleDeleteSetupReply(interaction);
      return;
    }
    if (!isRaidflowGuildLeadRole(roleProbe.role)) {
      await interaction.editReply('Keine Berechtigung: `/raidflow sync` ist nur für Gildenmeister oder Raidleader verfügbar.').catch(() => {});
      scheduleDeleteSetupReply(interaction);
      return;
    }

    await interaction.editReply('RaidFlow-Sync läuft…').catch(() => {});
    const syncResult = await runGuildMemberRoleSync(interaction.guild);
    await interaction
      .editReply(`RaidFlow-Sync abgeschlossen. ${formatSyncSummaryText(syncResult)}`)
      .catch(() => {});
    scheduleDeleteSetupReply(interaction);
  } catch (e) {
    await interaction
      .editReply(`RaidFlow-Sync fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`)
      .catch(() => {});
    scheduleDeleteSetupReply(interaction);
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
    '**App Home** – Wenn du RaidFlow als **Nutzer-App** installiert hast, öffnet die **Start**-Schaltfläche dieselbe Home-Übersicht in den Direktnachrichten (Primary Entry Point).',
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
    '**`/raidflow sync`** – Manueller Rollen-/Mitglieder-Sync für die Gilde (nur Gildenmeister oder Raidleader).',
    '',
    '**`/raidflow check`** – Status: Server in Webapp/DB, Mindestrollen, Bot-Berechtigungen, erlaubte Channels (Gildenverwaltung), deine Discord-Rollen vs. Webapp-Zuordnung. **Für alle Server-Mitglieder.**',
    '',
    '**`help`**, **`setup`**, **`group`** nur mit Setup-Recht (Owner / Administrator / Server verwalten). **`sync`** nur für Gildenmeister/Raidleader. **`check`** kann jeder auf dem Server nutzen.',
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
    scheduleDeleteSetupReply(interaction);
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
    scheduleDeleteSetupReply(interaction);
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
    const syncResult = await runGuildMemberRoleSync(interaction.guild);
    clearState(interaction);
    await interaction
      .editReply({
        content: `${message}\n\n${formatSyncSummaryText(syncResult)}`,
        components: [],
      })
      .catch(() => {});
    scheduleDeleteSetupReply(interaction);
  } catch (e) {
    await interaction.editReply({
      content: `Setup fehlgeschlagen: ${e.message}`,
      components: [],
    }).catch(() => {});
    scheduleDeleteSetupReply(interaction);
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
      const syncResult = await runGuildMemberRoleSync(guild);
      clearState(interaction);
      await interaction
        .editReply(`RaidFlow-Setup abgeschlossen. Rollen wurden angelegt und zugeordnet.\n\n${formatSyncSummaryText(syncResult)}`)
        .catch(() => {});
      scheduleDeleteSetupReply(interaction);
    } catch (e) {
      await interaction.editReply(`Fehler: ${e.message}`).catch(() => {});
      scheduleDeleteSetupReply(interaction);
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
    scheduleDeleteSetupReply(interaction);
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
    const syncResult = await runGuildMemberRoleSync(guild);
    clearState(interaction);
    await interaction
      .editReply(
        `RaidFlow-Setup abgeschlossen. Deine Rollen wurden auf dem Server angelegt und in der Webapp gespeichert.\n\n${formatSyncSummaryText(syncResult)}`
      )
      .catch(() => {});
    scheduleDeleteSetupReply(interaction);
  } catch (e) {
    await interaction.editReply(`Fehler: ${e.message}`).catch(() => {});
    scheduleDeleteSetupReply(interaction);
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
    scheduleDeleteSetupReply(interaction);
    return;
  }
  const role = guild.roles.cache.get(currentId);
  if (!role) {
    await interaction.reply({ content: 'Rolle auf dem Server nicht gefunden.', ephemeral: true }).catch(() => {});
    scheduleDeleteSetupReply(interaction);
    return;
  }
  const trimmed = newName.trim();
  if (!trimmed) {
    await interaction.reply({ content: 'Bitte einen Namen angeben.', ephemeral: true }).catch(() => {});
    scheduleDeleteSetupReply(interaction);
    return;
  }
  try {
    await role.setName(trimmed, 'RaidFlow Setup – Umbenennung');
  } catch (e) {
    await interaction.reply({ content: `Umbenennung fehlgeschlagen: ${e.message}`, ephemeral: true }).catch(() => {});
    scheduleDeleteSetupReply(interaction);
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
    scheduleDeleteSetupReply(interaction);
  } catch (e) {
    await interaction.editReply(`Speichern fehlgeschlagen: ${e.message}`).catch(() => {});
    scheduleDeleteSetupReply(interaction);
  }
}

async function handleModalNewForChange(interaction, roleKey, name) {
  const state = getState(interaction);
  const cfg = state?.existingConfig;
  const guild = interaction.guild;
  const trimmed = name.trim();
  if (!trimmed) {
    await interaction.reply({ content: 'Bitte einen Rollennamen angeben.', ephemeral: true }).catch(() => {});
    scheduleDeleteSetupReply(interaction);
    return;
  }
  let role;
  try {
    role = await guild.roles.create({ name: trimmed, reason: 'RaidFlow Setup' });
  } catch (e) {
    await interaction.reply({ content: `Rolle konnte nicht erstellt werden: ${e.message}`, ephemeral: true }).catch(() => {});
    scheduleDeleteSetupReply(interaction);
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
    scheduleDeleteSetupReply(interaction);
  } catch (e) {
    await interaction.editReply(`Speichern fehlgeschlagen: ${e.message}`).catch(() => {});
    scheduleDeleteSetupReply(interaction);
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
    scheduleDeleteSetupReply(interaction);
  } catch (e) {
    await interaction.editReply(`Fehler: ${e.message}`).catch(() => {});
    scheduleDeleteSetupReply(interaction);
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

async function callDiscordAction(body, interaction) {
  const payload = {
    ...body,
    ...(interaction?.channelId ? { discordChannelId: interaction.channelId } : {}),
  };
  const base = (process.env.WEBAPP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const res = await fetch(`${base}/api/bot/discord-action`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...getWebappHeaders() },
    body:    JSON.stringify(payload),
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

async function fetchRaidParticipantState(interaction, raidId) {
  const params = {
    action: 'raid-participant-state',
    discordUserId: interaction.user.id,
    raidId,
  };
  if (interaction.guildId) params.discordGuildId = interaction.guildId;
  if (interaction.channelId) params.discordChannelId = interaction.channelId;
  return getDiscordAction(params);
}

async function showAssignCharacterMenu(interaction, raidId, assignableChars, purpose, locale = 'de') {
  const { StringSelectMenuBuilder, ActionRowBuilder } = await import('discord.js');
  const raidNoDash = raidId.replace(/-/g, '');
  const select = new StringSelectMenuBuilder()
    .setCustomId(`rf:assignchar:${raidNoDash}:${purpose}`)
    .setPlaceholder(raidBotMessage(locale, 'ASSIGN_PLACEHOLDER'))
    .addOptions(assignableChars.slice(0, 25).map((c) => ({
      label: truncateDiscordLabel(`${c.name} (${c.mainSpec})`, 100),
      value: c.id,
      description: c.isMain ? raidBotMessage(locale, 'MAIN_CHAR') : raidBotMessage(locale, 'TWINK'),
    })));
  await interaction.editReply({
    content: raidBotMessage(locale, 'ASSIGN_MENU_TITLE'),
    components: [new ActionRowBuilder().addComponents(select)],
  }).catch(() => {});
}

/** Chars, die dieser Raid-Gilde zugeordnet sind (nicht nur Profil / andere Gilde). */
function guildCharactersFromParticipantState(json) {
  const chars = Array.isArray(json?.characters) ? json.characters : [];
  const assignable = Array.isArray(json?.assignableCharacters) ? json.assignableCharacters : [];
  const assignableIds = new Set(assignable.map((c) => c.id));
  return chars.filter((c) => !assignableIds.has(c.id));
}

function needsQuickjoinCharacterPick(state) {
  const guildChars = guildCharactersFromParticipantState(state);
  if (guildChars.length <= 1) return false;
  return !guildChars.some((c) => c.isMain === true);
}

async function showQuickjoinCharacterMenu(interaction, raidId, guildChars, locale = 'de') {
  const { StringSelectMenuBuilder, ActionRowBuilder } = await import('discord.js');
  const raidNoDash = raidId.replace(/-/g, '');
  const select = new StringSelectMenuBuilder()
    .setCustomId(`rf:qjchar:${raidNoDash}`)
    .setPlaceholder(raidBotMessage(locale, 'QJ_CHAR_PLACEHOLDER'))
    .addOptions(guildChars.slice(0, 25).map((c) => ({
      label: truncateDiscordLabel(`${c.name} (${c.mainSpec})`, 100),
      value: c.id,
      description: c.isMain ? raidBotMessage(locale, 'MAIN_CHAR') : raidBotMessage(locale, 'TWINK'),
    })));
  await interaction.editReply({
    content: raidBotMessage(locale, 'QJ_CHAR_PICK_TITLE'),
    components: [new ActionRowBuilder().addComponents(select)],
  }).catch(() => {});
}

const quickjoinPending = new Map();

async function runQuickjoinAfterPrep(interaction, raidId, locale, opts = {}) {
  const pendingKey = `${interaction.user.id}:${raidId}`;
  const pending = quickjoinPending.get(pendingKey);
  const raidPostMsg = opts.raidPostMsg ?? pending?.raidPostMsg ?? null;
  const originalComponents = opts.originalComponents ?? pending?.originalComponents ?? [];
  quickjoinPending.delete(pendingKey);

  const { ok, json } = await callDiscordAction({
    action: 'quickjoin',
    discordUserId: interaction.user.id,
    raidId,
    discordGuildId: interaction.guildId ?? '',
    ...(opts.characterId ? { characterId: opts.characterId } : {}),
  }, interaction);

  if (raidPostMsg && originalComponents.length) {
    await raidPostMsg.edit({ components: originalComponents }).catch(() => {});
  }

  const outcome = ok
    ? `⚡ ${json.message ?? raidBotMessage(locale, 'QUICKJOIN_OK')}`
    : raidActionErrorText(json.error, json, locale);
  await interaction.editReply({ content: outcome, components: [] }).catch(() => {});
  if (ok) triggerRaidPostReconcile(raidId, raidPostMsg);
  scheduleDeleteSingleEphemeralReply(interaction);
}

/**
 * Sync + Teilnehmerstatus. Bei Fehler wird bereits geantwortet.
 * @returns {Promise<{ ok: true, state: object } | { ok: false }>}
 */
async function ensureRaidParticipant(interaction, raidId, opts = {}) {
  const { requireCharacters = false, raidPostMsg = null, raidPostOrig = [] } = opts;
  const { ok, json } = await fetchRaidParticipantState(interaction, raidId);
  const locale = botLocale(interaction, json);
  if (!ok) {
    if (raidPostMsg && raidPostOrig.length) await restoreRaidPostComponents(raidPostMsg, raidPostOrig);
    await interaction.editReply({
      content: `❌ ${raidBotMessage(locale, 'BACKEND_FAILED')}`,
      components: [],
    }).catch(() => {});
    scheduleDeleteSingleEphemeralReply(interaction);
    return { ok: false };
  }
  if (!json.linked) {
    if (
      requireCharacters &&
      (opts.assignPurpose === 'qj' || opts.assignPurpose === 'join')
    ) {
      await startCharOnboarding(
        interaction,
        raidId,
        json,
        { ...opts, locale },
        charOnboardingDeps(),
      );
      return { ok: false };
    }
    if (raidPostMsg && raidPostOrig.length) await restoreRaidPostComponents(raidPostMsg, raidPostOrig);
    await interaction.editReply({ content: raidActionErrorText('NOT_LINKED', undefined, locale), components: [] }).catch(() => {});
    scheduleDeleteSingleEphemeralReply(interaction);
    return { ok: false };
  }
  if (!json.guildMember) {
    if (raidPostMsg && raidPostOrig.length) await restoreRaidPostComponents(raidPostMsg, raidPostOrig);
    await interaction.editReply({ content: raidActionErrorText('NOT_GUILD_MEMBER', undefined, locale), components: [] }).catch(() => {});
    scheduleDeleteSingleEphemeralReply(interaction);
    return { ok: false };
  }
  if (requireCharacters) {
    const chars = Array.isArray(json.characters) ? json.characters : [];
    const assignable = Array.isArray(json.assignableCharacters) ? json.assignableCharacters : [];
    if (chars.length === 0 && assignable.length > 0) {
      if (raidPostMsg && raidPostOrig.length) await restoreRaidPostComponents(raidPostMsg, raidPostOrig);
      await showAssignCharacterMenu(interaction, raidId, assignable, opts.assignPurpose ?? 'join', locale);
      return { ok: false };
    }
    if (chars.length === 0) {
      if (opts.assignPurpose === 'qj' || opts.assignPurpose === 'join') {
        await startCharOnboarding(
          interaction,
          raidId,
          json,
          { ...opts, locale },
          charOnboardingDeps(),
        );
        return { ok: false };
      }
      if (raidPostMsg && raidPostOrig.length) await restoreRaidPostComponents(raidPostMsg, raidPostOrig);
      await interaction.editReply({
        content: raidActionErrorText('NO_CHARACTER', json, locale),
        components: [],
      }).catch(() => {});
      scheduleDeleteSingleEphemeralReply(interaction);
      return { ok: false };
    }
  }
  return { ok: true, state: json, locale };
}

function raidActionOutcome(ok, json, okFallback, locale = 'de') {
  if (ok) return `✅ ${json.message ?? okFallback}`;
  if (json?.message) return `❌ ${json.message}`;
  return raidActionErrorText(json.error, json, locale);
}

const ANNOUNCED_SET_PLAYER_COMMENT_MIN = 10;

// ---------------------------------------------------------------------------
// Join-Flow State (mehrstufig: Char → Spec/Pünktlichkeit → Absenden)
// ---------------------------------------------------------------------------
const joinFlowState = new Map();
const JOIN_TTL_MS = 10 * 60 * 1000;

function jKey(userId, raidId) { return `join::${userId}::${raidId}`; }
function eKey(userId, raidId) { return `edit::${userId}::${raidId}`; }

function getJoinFlow(userId, raidId) {
  const entry = joinFlowState.get(jKey(userId, raidId));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { joinFlowState.delete(jKey(userId, raidId)); return null; }
  return entry.data;
}
function setJoinFlow(userId, raidId, data) {
  joinFlowState.set(jKey(userId, raidId), { data, expiresAt: Date.now() + JOIN_TTL_MS });
}
function clearJoinFlow(userId, raidId) { joinFlowState.delete(jKey(userId, raidId)); }

function getEditFlow(userId, raidId) {
  const entry = joinFlowState.get(eKey(userId, raidId));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { joinFlowState.delete(eKey(userId, raidId)); return null; }
  return entry.data;
}
function setEditFlow(userId, raidId, data) {
  joinFlowState.set(eKey(userId, raidId), { data, expiresAt: Date.now() + JOIN_TTL_MS });
}
function clearEditFlow(userId, raidId) { joinFlowState.delete(eKey(userId, raidId)); }

/** Reihenfolge für „Anmelden“ (Join1): Bin da → Unklar → Reserve. In nur-Reserve-Phase immer Reserve. */
function advanceJoinSignUpType(currentType, signupPhase) {
  if (signupPhase === 'reserve_only') return 'reserve';
  const order = ['normal', 'uncertain', 'reserve'];
  const cur = order.includes(currentType) ? currentType : 'normal';
  const i = order.indexOf(cur);
  return order[(i + 1) % order.length];
}

// ---------------------------------------------------------------------------
// Join 2 Flow (mehrstufig: Auswahl-Gruppen + Spec je Char + Notiz-Modal)
// ---------------------------------------------------------------------------
function j2Key(userId, raidId) { return `join2::${userId}::${raidId}`; }

function getJoin2Flow(userId, raidId) {
  const entry = joinFlowState.get(j2Key(userId, raidId));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    joinFlowState.delete(j2Key(userId, raidId));
    return null;
  }
  return entry.data;
}

function setJoin2Flow(userId, raidId, data) {
  joinFlowState.set(j2Key(userId, raidId), { data, expiresAt: Date.now() + JOIN_TTL_MS });
}

function clearJoin2Flow(userId, raidId) {
  joinFlowState.delete(j2Key(userId, raidId));
}

function getUniqueSpecs(char) {
  return [char?.mainSpec, char?.offSpec].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i);
}

function getJoin2ActiveChar(flow) {
  const idx = Math.max(0, Math.min(flow.step2Index ?? 0, (flow.selectedCharIds?.length ?? 1) - 1));
  const charId = flow.selectedCharIds[idx];
  return flow.chars.find(c => c.id === charId) ?? null;
}

async function deleteJoin2WizardReply(interaction, messageId) {
  if (!messageId) return;
  try {
    await interaction.webhook.deleteMessage(messageId);
  } catch {
    // Ephemeral-Nachricht kann bereits weg sein oder nicht mehr abrufbar.
  }
}

// ---------------------------------------------------------------------------
// WoW-Emoji-Hilfsfunktionen für den Bot
// ---------------------------------------------------------------------------
const SPEC_EMOJI_KEY_BOT = {
  'Holy Paladin':           'wow_holy_pala',
  'Protection Paladin':     'wow_protection_pala',
  'Retribution Paladin':    'wow_retribution',
  'Holy Priest':            'wow_holy_priest',
  'Discipline Priest':      'wow_discipline',
  'Shadow Priest':          'wow_shadow',
  'Protection Warrior':     'wow_protection',
  'Arms Warrior':           'wow_arms',
  'Fury Warrior':           'wow_fury',
  'Affliction Warlock':     'wow_affliction',
  'Demonology Warlock':     'wow_demonology',
  'Destruction Warlock':    'wow_destruction',
  'Restoration Shaman':     'wow_restoration',
  'Elemental Shaman':       'wow_elemental',
  'Enhancement Shaman':     'wow_enhancement',
  'Assassination Rogue':    'wow_assassination',
  'Combat Rogue':           'wow_combat',
  'Subtlety Rogue':         'wow_subtlety',
  'Arcane Mage':            'wow_arcane',
  'Fire Mage':              'wow_fire',
  'Frost Mage':             'wow_frost',
  'Beast Mastery Hunter':   'wow_beastmastery',
  'Marksmanship Hunter':    'wow_marksman',
  'Survival Hunter':        'wow_survival',
  'Balance Druid':          'wow_balance',
  'Feral Druid':            'wow_feral',
  'Feral (DPS) Druid':      'wow_feral',
  'Restoration Druid':      'wow_restoration_druid',
};

const CLASS_EMOJI_KEY_BOT = {
  Druid:   'wow_druid',
  Hunter:  'wow_hunter',
  Mage:    'wow_mage',
  Paladin: 'wow_paladin',
  Priest:  'wow_priest',
  Rogue:   'wow_rogue',
  Shaman:  'wow_shaman',
  Warlock: 'wow_warlock',
  Warrior: 'wow_warrior',
  Monk:    'wow_monk',
};

/** Parst Discord-Emoji-Markup <:name:id> oder <a:name:id> zu einem Discord.js-Emoji-Objekt. */
function parseDiscordEmoji(markup) {
  if (!markup || typeof markup !== 'string') return null;
  const m = markup.match(/^<(a?):([^:]+):(\d+)>$/);
  if (!m) return null;
  return { animated: m[1] === 'a', name: m[2], id: m[3] };
}

/** Gibt ein Discord.js-Emoji-Objekt für einen Spec zurück oder null. */
function specEmojiObj(spec, emojis) {
  const key    = SPEC_EMOJI_KEY_BOT[spec?.trim() ?? ''];
  const markup = key ? emojis?.[key] : null;
  return markup ? parseDiscordEmoji(markup) : null;
}

function classEmojiMarkupFromSpec(spec, emojis) {
  const parts = String(spec ?? '').trim().split(' ').filter(Boolean);
  const className = parts[parts.length - 1] ?? '';
  const key = CLASS_EMOJI_KEY_BOT[className];
  return key ? (emojis?.[key] ?? '') : '';
}

function specEmojiMarkup(spec, emojis) {
  const key = SPEC_EMOJI_KEY_BOT[spec?.trim() ?? ''];
  return key ? (emojis?.[key] ?? '') : '';
}

/** Baut eine ActionRow mit Spec-Buttons (Buttons statt Dropdown). */
async function buildSpecRow(rid, charNoDash, state, isEdit) {
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
  const prefix = isEdit ? 'editspecbtn' : 'specbtn';
  const specs  = [state.mainSpec, state.offSpec].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

  const buttons = specs.slice(0, 5).map((spec, idx) => {
    const isSelected = spec === state.selectedSpec;
    const emoji      = specEmojiObj(spec, state.emojis ?? {});
    const btn = new ButtonBuilder()
      .setCustomId(`rf:${prefix}:${rid}:${charNoDash}:${idx}`)
      .setLabel(truncateDiscordLabel(spec, 40))
      .setStyle(isSelected ? ButtonStyle.Primary : ButtonStyle.Secondary);
    if (emoji) btn.setEmoji(emoji);
    return btn;
  });

  return new ActionRowBuilder().addComponents(...buttons);
}

/** Baut die Spec/Pünktlichkeit-Auswahl-Nachricht für den Join-Flow. */
async function buildJoinConfigMessage(raidId, state, errorHint) {
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
  const locale = state.locale ?? 'de';
  const PUNC_LABELS = puncLabels(locale);
  const TYPE_LABELS = typeLabels(locale);
  const rid        = raidId.replace(/-/g, '');
  const charNoDash = state.charId.replace(/-/g, '');
  const rows       = [];

  // Spec-Buttons
  rows.push(await buildSpecRow(rid, charNoDash, state, false));

  // Pünktlichkeit-Buttons
  const puncDefs = [
    { key: 'on_time', style: ButtonStyle.Success },
    { key: 'tight',   style: ButtonStyle.Primary },
    { key: 'late',    style: ButtonStyle.Danger  },
  ];
  rows.push(new ActionRowBuilder().addComponents(
    ...puncDefs.map(p =>
      new ButtonBuilder()
        .setCustomId(`rf:punc:${rid}:${charNoDash}:${p.key}`)
        .setLabel(PUNC_LABELS[p.key])
        .setStyle(state.selectedPunc === p.key ? p.style : ButtonStyle.Secondary)
    )
  ));

  // Optionen-Zeile: Teilnahme-Art (Zyklus), Reserve sperren, Spec sperren
  const phase = state.signupPhase ?? 'full';
  const t = state.type ?? 'normal';
  const isReserve = t === 'reserve';
  const typeStyle = t === 'reserve' ? ButtonStyle.Danger : t === 'uncertain' ? ButtonStyle.Primary : ButtonStyle.Secondary;
  const typeBtn = phase === 'reserve_only'
    ? new ButtonBuilder()
      .setCustomId(`rf:jtype:${rid}:${charNoDash}`)
      .setLabel(raidBotMessage(locale, 'RESERVE_ONLY_BTN'))
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true)
    : new ButtonBuilder()
      .setCustomId(`rf:jtype:${rid}:${charNoDash}`)
      .setLabel(`${raidBotMessage(locale, 'TYPE_PREFIX')}: ${TYPE_LABELS[t] ?? t}`)
      .setStyle(typeStyle);
  rows.push(new ActionRowBuilder().addComponents(
    typeBtn,
    new ButtonBuilder()
      .setCustomId(`rf:jfr:${rid}:${charNoDash}`)
      .setLabel(state.forbidReserve ? raidBotMessage(locale, 'FORBID_RESERVE_ON') : raidBotMessage(locale, 'FORBID_RESERVE'))
      .setStyle(state.forbidReserve ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(isReserve),
    new ButtonBuilder()
      .setCustomId(`rf:jos:${rid}:${charNoDash}`)
      .setLabel(state.onlySignedSpec ? raidBotMessage(locale, 'LOCK_SPEC_ON') : raidBotMessage(locale, 'LOCK_SPEC'))
      .setStyle(state.onlySignedSpec ? ButtonStyle.Primary : ButtonStyle.Secondary),
  ));

  // Notiz allein
  const noteLabel = state.note?.trim()
    ? `📝 "${state.note.trim().slice(0, 30)}${state.note.length > 30 ? '…' : ''}"`
    : raidBotMessage(locale, 'NOTE_ADD');
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rf:joinnote:${rid}:${charNoDash}`)
      .setLabel(noteLabel)
      .setStyle(ButtonStyle.Secondary),
  ));

  // Anmelden-Button allein in letzter Zeile
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rf:submit:${rid}:${charNoDash}`)
      .setLabel(raidBotMessage(locale, 'SUBMIT_JOIN'))
      .setStyle(ButtonStyle.Success)
      .setDisabled(!state.selectedSpec),
  ));

  const warnDisp = errorHint ? `\n\n⚠️ ${errorHint}` : '';
  return {
    content:    `**${raidBotMessage(locale, 'JOIN_TITLE')}: ${state.charName}**${warnDisp}`,
    components: rows,
    ephemeral:  true,
  };
}

/** Baut die Bearbeiten-Nachricht. */
async function buildEditConfigMessage(raidId, state, errorHint) {
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
  const locale = state.locale ?? 'de';
  const PUNC_LABELS = puncLabels(locale);
  const TYPE_LABELS = typeLabels(locale);
  const rid        = raidId.replace(/-/g, '');
  const charNoDash = (state.charId ?? '').replace(/-/g, '');
  const rows       = [];

  // Spec-Buttons
  rows.push(await buildSpecRow(rid, charNoDash, state, true));

  const puncDefs = [
    { key: 'on_time', style: ButtonStyle.Success },
    { key: 'tight',   style: ButtonStyle.Primary },
    { key: 'late',    style: ButtonStyle.Danger  },
  ];
  rows.push(new ActionRowBuilder().addComponents(
    ...puncDefs.map(p =>
      new ButtonBuilder()
        .setCustomId(`rf:editpunc:${rid}:${charNoDash}:${p.key}`)
        .setLabel(PUNC_LABELS[p.key])
        .setStyle(state.selectedPunc === p.key ? p.style : ButtonStyle.Secondary)
    )
  ));

  const phaseE = state.signupPhase ?? 'full';
  const te = state.type ?? 'normal';
  const isReserveE = te === 'reserve';
  const typeStyleE = te === 'reserve' ? ButtonStyle.Danger : te === 'uncertain' ? ButtonStyle.Primary : ButtonStyle.Secondary;
  const typeBtnE = phaseE === 'reserve_only'
    ? new ButtonBuilder()
      .setCustomId(`rf:etype:${rid}:${charNoDash}`)
      .setLabel(raidBotMessage(locale, 'RESERVE_ONLY_BTN'))
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true)
    : new ButtonBuilder()
      .setCustomId(`rf:etype:${rid}:${charNoDash}`)
      .setLabel(`${raidBotMessage(locale, 'TYPE_PREFIX')}: ${TYPE_LABELS[te] ?? te}`)
      .setStyle(typeStyleE);
  rows.push(new ActionRowBuilder().addComponents(
    typeBtnE,
    new ButtonBuilder()
      .setCustomId(`rf:efr:${rid}:${charNoDash}`)
      .setLabel(state.forbidReserve ? raidBotMessage(locale, 'FORBID_RESERVE_ON') : raidBotMessage(locale, 'FORBID_RESERVE'))
      .setStyle(state.forbidReserve ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(isReserveE),
    new ButtonBuilder()
      .setCustomId(`rf:eos:${rid}:${charNoDash}`)
      .setLabel(state.onlySignedSpec ? raidBotMessage(locale, 'LOCK_SPEC_ON') : raidBotMessage(locale, 'LOCK_SPEC'))
      .setStyle(state.onlySignedSpec ? ButtonStyle.Primary : ButtonStyle.Secondary),
  ));

  // Notiz allein
  const noteLabel = state.existingNote?.trim()
    ? `📝 "${state.existingNote.trim().slice(0, 30)}${state.existingNote.length > 30 ? '…' : ''}"`
    : raidBotMessage(locale, 'NOTE_EDIT');
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rf:editnote:${rid}:${charNoDash}`)
      .setLabel(noteLabel)
      .setStyle(ButtonStyle.Secondary),
  ));

  // Speichern-Button allein in letzter Zeile
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rf:submitedit:${rid}:${charNoDash}`)
      .setLabel(raidBotMessage(locale, 'SUBMIT_SAVE'))
      .setStyle(ButtonStyle.Success),
  ));

  const warnDisp = errorHint ? `\n\n⚠️ ${errorHint}` : '';
  return {
    content:    `**${raidBotMessage(locale, 'EDIT_TITLE')}: ${state.charName}**${warnDisp}`,
    components: rows,
    ephemeral:  true,
  };
}

// --- Button-Handler ----------------------------------------------------------

/** Sperrt alle Buttons einer Nachricht während der Bot verarbeitet. */
async function disableRaidPostButtons(message) {
  if (!message?.components?.length) return;
  const { ActionRowBuilder, ButtonBuilder } = await import('discord.js');
  const disabledRows = message.components.map(row =>
    new ActionRowBuilder().addComponents(
      row.components.map(btn => ButtonBuilder.from(btn).setDisabled(true))
    )
  );
  await message.edit({ components: disabledRows });
}

async function restoreRaidPostComponents(message, originalComponents) {
  if (message && originalComponents?.length) {
    await message.edit({ components: originalComponents }).catch(() => {});
  }
}

/** Ephemer während Webapp-Call — verhindert Doppelklicks auf den Wizard. */

/**
 * Speichert die Raid-Post-Nachricht für spätere Button-Verwaltung (Join/Edit-Flow).
 * Schlüssel: `${userId}:${raidId}`
 */
const raidPostMessages = new Map();

/** Ephemerale Bot-Rückmeldungen nach Abschluss kurz anzeigen, dann entfernen. */
const RAID_EPHEMERAL_TTL_MS = 6000;

function scheduleDeleteSingleEphemeralReply(interaction) {
  setTimeout(() => interaction.deleteReply().catch(() => {}), RAID_EPHEMERAL_TTL_MS);
}

/** Stiller Hintergrund-Abgleich Raid-Post-Embed ↔ Backend (nach erfolgreicher Mutation). */
function triggerRaidPostReconcile(raidId) {
  scheduleRaidPostReconcile(client, getWebappJson, raidId);
}

async function handleRaidQuickjoin(interaction, raidId) {
  await interaction.deferReply({ ephemeral: true }).catch(() => {});
  const raidPostMsg        = interaction.message;
  raidPostMessages.set(`${interaction.user.id}:${raidId}`, raidPostMsg);
  const originalComponents = raidPostMsg?.components ?? [];
  if (originalComponents.length) {
    await disableRaidPostButtons(raidPostMsg).catch(() => {});
  }

  const prep = await ensureRaidParticipant(interaction, raidId, {
    requireCharacters: true,
    assignPurpose: 'qj',
    raidPostMsg,
    raidPostOrig: originalComponents,
  });
  if (!prep.ok) return;
  const locale = prep.locale ?? botLocale(interaction, prep.state);

  if (needsQuickjoinCharacterPick(prep.state)) {
    quickjoinPending.set(`${interaction.user.id}:${raidId}`, { raidPostMsg, originalComponents });
    await showQuickjoinCharacterMenu(
      interaction,
      raidId,
      guildCharactersFromParticipantState(prep.state),
      locale,
    );
    return;
  }

  await runQuickjoinAfterPrep(interaction, raidId, locale, { raidPostMsg, originalComponents });
}

async function handleQuickjoinCharSelect(interaction, raidId) {
  const characterId = interaction.values?.[0];
  if (!characterId) return;
  await interaction.deferUpdate().catch(() => {});
  const { ok, json } = await fetchRaidParticipantState(interaction, raidId);
  const locale = ok ? botLocale(interaction, json) : botLocale(interaction, null);
  await runQuickjoinAfterPrep(interaction, raidId, locale, { characterId });
}

async function showDeclineModal(interaction, raidId, locale = 'de') {
  const raidNoDash = raidId.replace(/-/g, '');
  const modal = new ModalBuilder()
    .setCustomId(`rfm:decline:${raidNoDash}`)
    .setTitle(raidBotMessage(locale, 'DECLINE_MODAL_TITLE'));
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel(raidBotMessage(locale, 'DECLINE_REASON_LABEL'))
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500)
        .setPlaceholder(raidBotMessage(locale, 'DECLINE_PLACEHOLDER')),
    ),
  );
  await interaction.showModal(modal).catch(() => {});
}

async function handleRaidDeclineModal(interaction, raidId) {
  const reason = interaction.fields.getTextInputValue('reason').trim();
  await runRaidDecline(interaction, raidId, reason);
}

/** Nutzer per DM benachrichtigen (z. B. wenn eine Aktion im Nachgang fehlschlägt). */
async function sendRaidActionFailureDM(interaction, message) {
  try {
    await interaction.user.send(message);
  } catch {
    /* Nutzer hat DMs für den Server deaktiviert – ignorieren. */
  }
}

async function runRaidDecline(interaction, raidId, reason) {
  // Interaktion sofort bestätigen (falls noch nicht geschehen), damit der 3-Sekunden-Timeout
  // von Discord nicht überschritten wird ("Diese Interaktion ist fehlgeschlagen.").
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});
  }
  const raidPostMsg        = interaction.message;
  const originalComponents = raidPostMsg?.components ?? [];
  if (originalComponents.length) {
    await disableRaidPostButtons(raidPostMsg).catch(() => {});
  }

  const discordUserLabel =
    interaction.member?.displayName?.trim() ||
    interaction.user.globalName?.trim() ||
    interaction.user.username;

  const { ok: prepOk, json: prepJson } = await fetchRaidParticipantState(interaction, raidId);
  const locale = prepOk ? botLocale(interaction, prepJson) : botLocale(interaction, null);

  const { ok, json } = await callDiscordAction({
    action: 'decline',
    discordUserId: interaction.user.id,
    raidId,
    reason: reason ?? '',
    discordUserLabel,
    discordGuildId: interaction.guildId ?? '',
  }, interaction);

  if (raidPostMsg && originalComponents.length) {
    await raidPostMsg.edit({ components: originalComponents }).catch(() => {});
  }

  if (ok) {
    await interaction.editReply({
      content: `🚫 ${json.message ?? raidBotMessage(locale, 'DECLINED_OK')}`,
      components: [],
    }).catch(() => {});
    triggerRaidPostReconcile(raidId, raidPostMsg);
    scheduleDeleteSingleEphemeralReply(interaction);
    return;
  }

  // Gesetzter Spieler ohne Begründung → Folge-Button anbieten (Modal nach deferReply nicht direkt möglich).
  if (json?.error === 'COMMENT_REQUIRED') {
    const raidNoDash = raidId.replace(/-/g, '');
    const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');
    const btn = new ButtonBuilder()
      .setCustomId(`rf:declreason:${raidNoDash}`)
      .setLabel(raidBotMessage(locale, 'DECLINE_REASON_BTN'))
      .setStyle(ButtonStyle.Danger);
    await interaction.editReply({
      content: `⚠️ ${raidBotMessage(locale, 'COMMENT_REQUIRED_HINT')}`,
      components: [new ActionRowBuilder().addComponents(btn)],
    }).catch(() => {});
    return;
  }

  // Sonstiger Fehler: Ephemer-Antwort schließen und Nutzer im Nachgang per DM informieren.
  const errText = raidActionOutcome(false, json, '', locale);
  await interaction.editReply({ content: errText, components: [] }).catch(() => {});
  await sendRaidActionFailureDM(
    interaction,
    raidBotMessage(locale, 'DECLINE_FAIL_DM', { err: errText }),
  );
  scheduleDeleteSingleEphemeralReply(interaction);
}

async function handleRaidDeclineButton(interaction, raidId) {
  // Interaktion SOFORT bestätigen – ohne vorherigen Backend-Call – damit der 3-Sekunden-Timeout
  // von Discord nicht überschritten wird ("Diese Interaktion ist fehlgeschlagen.").
  // Die eigentliche Verarbeitung läuft danach; ob eine Begründung nötig ist (gesetzter Spieler),
  // entscheidet das Backend (COMMENT_REQUIRED → Folge-Button für das Begründungs-Modal).
  await interaction.deferReply({ ephemeral: true }).catch(() => {});
  await runRaidDecline(interaction, raidId, '');
}

/** Folge-Button „Begründung eingeben“ (frische Interaktion) → Begründungs-Modal öffnen. */
async function handleRaidDeclineReasonButton(interaction, raidId) {
  const { ok, json } = await fetchRaidParticipantState(interaction, raidId);
  const locale = ok ? botLocale(interaction, json) : botLocale(interaction, null);
  await showDeclineModal(interaction, raidId, locale);
}

async function continueRaidJoinFlow(interaction, raidId, guildId, json, locale = 'de') {
  const chars       = Array.isArray(json.characters) ? json.characters : [];
  const emojis      = json.discordEmojis ?? {};
  const signupPhase = json.signupPhase ?? 'full';
  if (chars.length === 1) {
    const c = chars[0];
    const initialType = signupPhase === 'reserve_only' ? 'reserve' : 'normal';
    setJoinFlow(interaction.user.id, raidId, {
      charId: c.id, charName: c.name, mainSpec: c.mainSpec, offSpec: c.offSpec ?? null,
      selectedSpec: c.mainSpec, selectedPunc: 'on_time', note: '', emojis,
      signupPhase,
      type: initialType, forbidReserve: false, onlySignedSpec: false,
      locale,
    });
    const msg = await buildJoinConfigMessage(raidId, getJoinFlow(interaction.user.id, raidId));
    await interaction.editReply({ content: msg.content, components: msg.components }).catch(() => {});
    return;
  }
  // Mehrere Chars → Auswahl-Menü (keine Vorauswahl, emojis im State merken für späteren Step)
  const { StringSelectMenuBuilder, ActionRowBuilder } = await import('discord.js');
  const raidNoDash  = raidId.replace(/-/g, '');
  const guildNoDash = guildId.replace(/-/g, '');
  // Temp-Emojis im State vorhalten (charId wird später durch Char-Auswahl gesetzt)
  setJoinFlow(interaction.user.id, raidId, { emojis, _pendingChars: chars, signupPhase, locale });
  const select = new StringSelectMenuBuilder()
    .setCustomId(`rf:selchar:${raidNoDash}:${guildNoDash}`)
    .setPlaceholder(raidBotMessage(locale, 'PICK_CHAR_PLACEHOLDER'))
    .addOptions(chars.slice(0, 25).map(c => ({
      label:       truncateDiscordLabel(`${c.name} (${c.mainSpec})`, 100),
      value:       c.id,
      description: c.isMain ? raidBotMessage(locale, 'MAIN_CHAR') : raidBotMessage(locale, 'TWINK'),
    })));
  await interaction.editReply({
    content:    raidBotMessage(locale, 'PICK_CHAR_SIGNUP'),
    components: [new ActionRowBuilder().addComponents(select)],
  }).catch(() => {});
}

async function handleRaidJoinButton(interaction, raidId, guildId) {
  raidPostMessages.set(`${interaction.user.id}:${raidId}`, interaction.message);
  const raidPostMsg = interaction.message;
  const raidPostOrig = raidPostMsg?.components ?? [];
  await interaction.deferReply({ ephemeral: true }).catch(() => {});
  if (raidPostMsg && raidPostOrig.length) {
    await disableRaidPostButtons(raidPostMsg).catch(() => {});
  }
  const prep = await ensureRaidParticipant(interaction, raidId, {
    requireCharacters: true,
    assignPurpose: 'join',
    raidPostMsg,
    raidPostOrig,
  });
  if (!prep.ok) return;
  await restoreRaidPostComponents(raidPostMsg, raidPostOrig);
  const flowGuildId = guildId || prep.state.raidGuildId;
  await continueRaidJoinFlow(interaction, raidId, flowGuildId, prep.state, prep.locale ?? botLocale(interaction, prep.state));
}

async function continueRaidJoin2Flow(interaction, raidId, json) {
  const chars = Array.isArray(json.characters) ? json.characters : [];
  const signupPhase = json.signupPhase ?? 'full';
  const locale = botLocale(interaction, json);
  setJoin2Flow(interaction.user.id, raidId, {
    chars,
    signupPhase,
    type: signupPhase === 'reserve_only' ? 'reserve' : 'normal',
    punctuality: 'on_time',
    selectedCharIds: [],
    perChar: {},
    step2Index: 0,
    note: '',
    replyMessageId: null,
    locale,
  });

  const msg = await buildJoin2Step1Message(raidId, getJoin2Flow(interaction.user.id, raidId));
  const reply = await interaction.editReply(msg).catch(() => null);
  if (reply?.id) {
    const flow = getJoin2Flow(interaction.user.id, raidId);
    if (flow) flow.replyMessageId = reply.id;
  }
}

async function handleAssignCharSelect(interaction, raidId, purpose) {
  const characterId = interaction.values[0];
  await interaction.deferUpdate().catch(() => {});
  const locale = botLocale(interaction, null);
  const { ok, json } = await callDiscordAction({
    action: 'assign-character-guild',
    discordUserId: interaction.user.id,
    raidId,
    characterId,
    discordGuildId: interaction.guildId ?? '',
  }, interaction);
  if (!ok) {
    await interaction.editReply({
      content: raidActionErrorText(json?.error, json, locale) || json?.message || `❌ ${raidBotMessage(locale, 'ASSIGN_FAILED')}`,
      components: [],
    }).catch(() => {});
    scheduleDeleteSingleEphemeralReply(interaction);
    return;
  }

  const { ok: stateOk, json: state } = await fetchRaidParticipantState(interaction, raidId);
  const stateLocale = stateOk ? botLocale(interaction, state) : locale;
  if (!stateOk || !state.guildMember) {
    await interaction.editReply({
      content: `❌ ${raidBotMessage(stateLocale, 'CHAR_ASSIGNED_UNCLEAR')}`,
      components: [],
    }).catch(() => {});
    scheduleDeleteSingleEphemeralReply(interaction);
    return;
  }

  if (purpose === 'qj') {
    await runQuickjoinAfterPrep(interaction, raidId, stateLocale, { characterId });
    return;
  }

  if (purpose === 'join2') {
    await interaction.editReply({ content: `✅ ${raidBotMessage(stateLocale, 'CHAR_ASSIGNED')}`, components: [] }).catch(() => {});
    await continueRaidJoin2Flow(interaction, raidId, state);
    return;
  }

  await interaction.editReply({ content: `✅ ${raidBotMessage(stateLocale, 'CHAR_ASSIGNED')}`, components: [] }).catch(() => {});
  await continueRaidJoinFlow(interaction, raidId, state.raidGuildId, state, stateLocale);
}

async function buildJoin2Step1Message(raidId, flow, errorHint) {
  const { StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
  const locale = flow?.locale ?? 'de';
  const TYPE_LABELS = typeLabels(locale);
  const PUNC_LABELS = puncLabels(locale);
  const rid = raidId.replace(/-/g, '');
  const selectedChars = Array.isArray(flow.selectedCharIds) ? flow.selectedCharIds : [];
  const hasSelection = selectedChars.length > 0;

  const charSelect = new StringSelectMenuBuilder()
    .setCustomId(`rf:j2chars:${rid}`)
    .setPlaceholder('Charaktere auswählen…')
    .setMinValues(0)
    .setMaxValues(Math.min(25, flow.chars.length))
    .addOptions(
      flow.chars.slice(0, 25).map(c => ({
        label: truncateDiscordLabel(`${c.name} (${c.mainSpec})`, 100),
        value: c.id,
        description: c.isMain ? 'Hauptcharakter' : 'Twink',
        default: selectedChars.includes(c.id),
      }))
    );

  const phase = flow.signupPhase ?? 'full';
  const typeSelectOpts =
    phase === 'reserve_only'
      ? [{ label: 'Reserve (nur noch möglich)', value: 'reserve', default: true }]
      : [
          { label: 'Bin da', value: 'normal', default: flow.type === 'normal' },
          { label: 'Reserve', value: 'reserve', default: flow.type === 'reserve' },
          { label: 'Unklar', value: 'uncertain', default: flow.type === 'uncertain' },
        ];
  const typeSelect = new StringSelectMenuBuilder()
    .setCustomId(`rf:j2type:${rid}`)
    .setPlaceholder(phase === 'reserve_only' ? 'Nur Reserve…' : 'Teilnahme wählen…')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(typeSelectOpts);

  const puncSelect = new StringSelectMenuBuilder()
    .setCustomId(`rf:j2punc:${rid}`)
    .setPlaceholder('Pünktlichkeit wählen…')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions([
      { label: 'Rechtzeitig', value: 'on_time', default: flow.punctuality === 'on_time' },
      { label: 'Wird knapp', value: 'tight', default: flow.punctuality === 'tight' },
      { label: 'Später', value: 'late', default: flow.punctuality === 'late' },
    ]);

  const warn = errorHint ? `\n\n⚠️ ${errorHint}` : '';
  const reserveHint =
    phase === 'reserve_only'
      ? '\n*Nur noch Reserve — Raid ist angekündigt oder der Anmeldeschluss ist vorbei.*'
      : '';
  return {
    content: [
      '**Anmelden 2 · Schritt 1/2**',
      reserveHint,
      `Teilnahme: **${TYPE_LABELS[flow.type] ?? flow.type}**`,
      `Pünktlichkeit: **${PUNC_LABELS[flow.punctuality] ?? flow.punctuality}**`,
      `Ausgewählte Chars: **${selectedChars.length}**`,
      warn,
    ].join('\n'),
    components: [
      new ActionRowBuilder().addComponents(charSelect),
      new ActionRowBuilder().addComponents(typeSelect),
      new ActionRowBuilder().addComponents(puncSelect),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`rf:j2next:${rid}`)
          .setLabel('Weiter zu Specs')
          .setStyle(hasSelection ? ButtonStyle.Primary : ButtonStyle.Secondary)
      ),
    ],
    ephemeral: true,
  };
}

async function buildJoin2Step2Message(raidId, flow, errorHint) {
  const { StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
  const locale = flow?.locale ?? 'de';
  const TYPE_LABELS = typeLabels(locale);
  const PUNC_LABELS = puncLabels(locale);
  const rid = raidId.replace(/-/g, '');
  const activeChar = getJoin2ActiveChar(flow);
  if (!activeChar) {
    return {
      content: '⚠️ Keine Charakterauswahl vorhanden. Bitte starte „Anmelden 2“ erneut.',
      components: [],
      ephemeral: true,
    };
  }

  const total = flow.selectedCharIds.length;
  const idx = Math.max(0, Math.min(flow.step2Index ?? 0, total - 1));
  const cfg = flow.perChar?.[activeChar.id] ?? {
    selectedSpec: activeChar.mainSpec,
    onlySignedSpec: false,
    forbidReserve: false,
  };
  const specs = getUniqueSpecs(activeChar);

  const specSelect = new StringSelectMenuBuilder()
    .setCustomId(`rf:j2spec:${rid}:${activeChar.id.replace(/-/g, '')}`)
    .setPlaceholder('Spec wählen…')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      specs.map(spec => ({
        label: truncateDiscordLabel(spec, 100),
        value: spec,
        default: (cfg.selectedSpec ?? activeChar.mainSpec) === spec,
      }))
    );

  const optionDefs = [
    {
      label: 'Nur angemeldete Spec',
      value: 'only_signed_spec',
      default: cfg.onlySignedSpec === true,
      description: 'Char wird nur in dieser Spec berücksichtigt',
    },
  ];
  if (flow.type !== 'reserve') {
    optionDefs.push({
      label: 'Reserve verbieten',
      value: 'forbid_reserve',
      default: cfg.forbidReserve === true,
      description: 'Dieser Char darf nicht auf Reserve verschoben werden',
    });
  }

  const optionsSelect = new StringSelectMenuBuilder()
    .setCustomId(`rf:j2opts:${rid}:${activeChar.id.replace(/-/g, '')}`)
    .setPlaceholder('Optionen wählen…')
    .setMinValues(0)
    .setMaxValues(optionDefs.length)
    .addOptions(optionDefs);

  const notePreview = flow.note?.trim()
    ? `Notiz: "${flow.note.trim().slice(0, 40)}${flow.note.trim().length > 40 ? '…' : ''}"`
    : 'Notiz: —';
  const lateHint = flow.punctuality === 'late' ? '\n⚠️ Bei „Später“ ist eine Notiz Pflicht.' : '';
  const warn = errorHint ? `\n\n⚠️ ${errorHint}` : '';

  return {
    content: [
      `**Anmelden 2 · Schritt 2/2 (${idx + 1}/${total})**`,
      `Char: **${activeChar.name}**`,
      `Teilnahme: **${TYPE_LABELS[flow.type] ?? flow.type}**`,
      `Pünktlichkeit: **${PUNC_LABELS[flow.punctuality] ?? flow.punctuality}**`,
      notePreview,
      lateHint,
      warn,
    ].join('\n'),
    components: [
      new ActionRowBuilder().addComponents(specSelect),
      new ActionRowBuilder().addComponents(optionsSelect),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`rf:j2prev:${rid}`)
          .setLabel('Vorheriger Char')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(idx <= 0),
        new ButtonBuilder()
          .setCustomId(`rf:j2nextchar:${rid}`)
          .setLabel('Nächster Char')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(idx >= total - 1),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`rf:j2open:${rid}`)
          .setLabel('Notiz & Absenden')
          .setStyle(ButtonStyle.Success),
      ),
    ],
    ephemeral: true,
  };
}

async function handleRaidJoin2Button(interaction, raidId) {
  raidPostMessages.set(`${interaction.user.id}:${raidId}`, interaction.message);
  const raidPostMsg = interaction.message;
  const raidPostOrig = raidPostMsg?.components ?? [];
  await interaction.deferReply({ ephemeral: true }).catch(() => {});
  if (raidPostMsg && raidPostOrig.length) {
    await disableRaidPostButtons(raidPostMsg).catch(() => {});
  }

  const prep = await ensureRaidParticipant(interaction, raidId, {
    requireCharacters: true,
    assignPurpose: 'join2',
    raidPostMsg,
    raidPostOrig,
  });
  if (!prep.ok) return;

  await restoreRaidPostComponents(raidPostMsg, raidPostOrig);
  await continueRaidJoin2Flow(interaction, raidId, prep.state);

  const reply = { id: null };
  {
    const flow = getJoin2Flow(interaction.user.id, raidId);
    if (flow?.replyMessageId) reply.id = flow.replyMessageId;
  }
  if (reply?.id) {
    const current = getJoin2Flow(interaction.user.id, raidId);
    if (current) {
      setJoin2Flow(interaction.user.id, raidId, { ...current, replyMessageId: reply.id });
    }
  }
}

async function handleJoin2CharsSelect(interaction, raidId) {
  const flow = getJoin2Flow(interaction.user.id, raidId);
  if (!flow) {
    await interaction.reply({ content: '⚠️ Sitzung abgelaufen. Bitte erneut auf „Anmelden 2“ klicken.', ephemeral: true }).catch(() => {});
    return;
  }
  const selectedSet = new Set(interaction.values ?? []);
  const selectedCharIds = flow.chars.filter(c => selectedSet.has(c.id)).map(c => c.id);
  setJoin2Flow(interaction.user.id, raidId, { ...flow, selectedCharIds });
  const msg = await buildJoin2Step1Message(raidId, getJoin2Flow(interaction.user.id, raidId));
  await interaction.update(msg).catch(() => {});
}

async function handleJoin2TypeSelect(interaction, raidId) {
  const flow = getJoin2Flow(interaction.user.id, raidId);
  if (!flow) {
    await interaction.reply({ content: '⚠️ Sitzung abgelaufen. Bitte erneut auf „Anmelden 2“ klicken.', ephemeral: true }).catch(() => {});
    return;
  }
  let type = interaction.values?.[0] ?? 'normal';
  if ((flow.signupPhase ?? 'full') === 'reserve_only') type = 'reserve';
  const perChar = { ...(flow.perChar ?? {}) };
  if (type === 'reserve') {
    for (const cid of Object.keys(perChar)) {
      perChar[cid] = { ...perChar[cid], forbidReserve: false };
    }
  }
  setJoin2Flow(interaction.user.id, raidId, { ...flow, type, perChar });
  const msg = await buildJoin2Step1Message(raidId, getJoin2Flow(interaction.user.id, raidId));
  await interaction.update(msg).catch(() => {});
}

async function handleJoin2PuncSelect(interaction, raidId) {
  const flow = getJoin2Flow(interaction.user.id, raidId);
  if (!flow) {
    await interaction.reply({ content: '⚠️ Sitzung abgelaufen. Bitte erneut auf „Anmelden 2“ klicken.', ephemeral: true }).catch(() => {});
    return;
  }
  const punctuality = interaction.values?.[0] ?? 'on_time';
  setJoin2Flow(interaction.user.id, raidId, { ...flow, punctuality });
  const msg = await buildJoin2Step1Message(raidId, getJoin2Flow(interaction.user.id, raidId));
  await interaction.update(msg).catch(() => {});
}

async function handleJoin2ToStep2(interaction, raidId) {
  const flow = getJoin2Flow(interaction.user.id, raidId);
  if (!flow) {
    await interaction.reply({ content: '⚠️ Sitzung abgelaufen. Bitte erneut auf „Anmelden 2“ klicken.', ephemeral: true }).catch(() => {});
    return;
  }
  if (!Array.isArray(flow.selectedCharIds) || flow.selectedCharIds.length === 0) {
    const msg = await buildJoin2Step1Message(raidId, flow, 'Bitte mindestens einen Charakter auswählen.');
    await interaction.update(msg).catch(() => {});
    return;
  }

  const perChar = { ...(flow.perChar ?? {}) };
  for (const cid of flow.selectedCharIds) {
    const char = flow.chars.find(c => c.id === cid);
    if (!char) continue;
    const oldCfg = perChar[cid] ?? {};
    perChar[cid] = {
      selectedSpec: oldCfg.selectedSpec ?? char.mainSpec,
      onlySignedSpec: oldCfg.onlySignedSpec === true,
      forbidReserve: flow.type === 'reserve' ? false : oldCfg.forbidReserve === true,
    };
  }

  setJoin2Flow(interaction.user.id, raidId, {
    ...flow,
    step2Index: 0,
    perChar,
  });
  const msg = await buildJoin2Step2Message(raidId, getJoin2Flow(interaction.user.id, raidId));
  await interaction.update(msg).catch(() => {});
}

async function handleJoin2SpecSelect(interaction, raidId) {
  const flow = getJoin2Flow(interaction.user.id, raidId);
  if (!flow) {
    await interaction.reply({ content: '⚠️ Sitzung abgelaufen. Bitte erneut auf „Anmelden 2“ klicken.', ephemeral: true }).catch(() => {});
    return;
  }
  const activeChar = getJoin2ActiveChar(flow);
  const selectedSpec = interaction.values?.[0];
  if (!activeChar || !selectedSpec) {
    await interaction.reply({ content: '⚠️ Ungültige Auswahl.', ephemeral: true }).catch(() => {});
    return;
  }
  const perChar = { ...(flow.perChar ?? {}) };
  perChar[activeChar.id] = { ...(perChar[activeChar.id] ?? {}), selectedSpec };
  setJoin2Flow(interaction.user.id, raidId, { ...flow, perChar });
  const msg = await buildJoin2Step2Message(raidId, getJoin2Flow(interaction.user.id, raidId));
  await interaction.update(msg).catch(() => {});
}

async function handleJoin2OptionsSelect(interaction, raidId) {
  const flow = getJoin2Flow(interaction.user.id, raidId);
  if (!flow) {
    await interaction.reply({ content: '⚠️ Sitzung abgelaufen. Bitte erneut auf „Anmelden 2“ klicken.', ephemeral: true }).catch(() => {});
    return;
  }
  const activeChar = getJoin2ActiveChar(flow);
  if (!activeChar) {
    await interaction.reply({ content: '⚠️ Kein aktiver Charakter.', ephemeral: true }).catch(() => {});
    return;
  }
  const selected = new Set(interaction.values ?? []);
  const perChar = { ...(flow.perChar ?? {}) };
  perChar[activeChar.id] = {
    ...(perChar[activeChar.id] ?? {}),
    selectedSpec: perChar[activeChar.id]?.selectedSpec ?? activeChar.mainSpec,
    onlySignedSpec: selected.has('only_signed_spec'),
    forbidReserve: flow.type === 'reserve' ? false : selected.has('forbid_reserve'),
  };
  setJoin2Flow(interaction.user.id, raidId, { ...flow, perChar });
  const msg = await buildJoin2Step2Message(raidId, getJoin2Flow(interaction.user.id, raidId));
  await interaction.update(msg).catch(() => {});
}

async function handleJoin2StepNav(interaction, raidId, direction) {
  const flow = getJoin2Flow(interaction.user.id, raidId);
  if (!flow) {
    await interaction.reply({ content: '⚠️ Sitzung abgelaufen. Bitte erneut auf „Anmelden 2“ klicken.', ephemeral: true }).catch(() => {});
    return;
  }
  const total = flow.selectedCharIds?.length ?? 0;
  if (!total) {
    const msg = await buildJoin2Step1Message(raidId, flow, 'Bitte mindestens einen Charakter auswählen.');
    await interaction.update(msg).catch(() => {});
    return;
  }
  const current = Math.max(0, Math.min(flow.step2Index ?? 0, total - 1));
  const next = direction === 'prev'
    ? Math.max(0, current - 1)
    : Math.min(total - 1, current + 1);
  setJoin2Flow(interaction.user.id, raidId, { ...flow, step2Index: next });
  const msg = await buildJoin2Step2Message(raidId, getJoin2Flow(interaction.user.id, raidId));
  await interaction.update(msg).catch(() => {});
}

async function handleJoin2OpenNoteModal(interaction, raidId) {
  const flow = getJoin2Flow(interaction.user.id, raidId);
  if (!flow) {
    await interaction.reply({ content: '⚠️ Sitzung abgelaufen. Bitte erneut auf „Anmelden 2“ klicken.', ephemeral: true }).catch(() => {});
    return;
  }
  if (!flow.selectedCharIds?.length) {
    const msg = await buildJoin2Step1Message(raidId, flow, 'Bitte mindestens einen Charakter auswählen.');
    await interaction.update(msg).catch(() => {});
    return;
  }

  const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
  const modal = new ModalBuilder()
    .setCustomId(`rfm:join2note:${raidId.replace(/-/g, '')}`)
    .setTitle('Anmelden 2 · Notiz');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('note')
        .setLabel('Notiz an Raidleader')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(flow.punctuality === 'late')
        .setValue(flow.note ?? '')
        .setMaxLength(500)
        .setPlaceholder(flow.punctuality === 'late'
          ? 'Bei „Später“ bitte Verspätung angeben (z. B. „15 Min später“) '
          : 'Optional, z. B. Abwesenheitshinweis')
    )
  );
  await interaction.showModal(modal).catch(() => {});
}

async function handleJoin2NoteModal(interaction, raidId) {
  const flow = getJoin2Flow(interaction.user.id, raidId);
  if (!flow) {
    await interaction.reply({ content: '⚠️ Sitzung abgelaufen. Bitte erneut auf „Anmelden 2“ klicken.', ephemeral: true }).catch(() => {});
    return;
  }

  const note = interaction.fields.getTextInputValue('note').trim();
  if (flow.punctuality === 'late' && !note) {
    await interaction.reply({
      content: '⚠️ Bei „Später“ ist eine Notiz mit Verspätung erforderlich. Bitte erneut absenden.',
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  await interaction.deferReply({ ephemeral: true }).catch(() => {});
  await interaction.editReply({ content: raidBotMessage(flow?.locale ?? botLocale(interaction, null), 'LOADING_JOIN2'), components: [] }).catch(() => {});

  const raidPostMsg = raidPostMessages.get(`${interaction.user.id}:${raidId}`) ?? null;
  const raidPostComponents = raidPostMsg?.components ?? [];
  if (raidPostMsg && raidPostComponents.length) {
    await disableRaidPostButtons(raidPostMsg).catch(() => {});
  }

  const selectedCharIds = flow.selectedCharIds ?? [];
  const errors = [];
  let okCount = 0;

  for (const charId of selectedCharIds) {
    const char = flow.chars.find(c => c.id === charId);
    if (!char) continue;
    const cfg = flow.perChar?.[charId] ?? {};
    const { ok, json } = await callDiscordAction({
      action: 'join',
      discordUserId: interaction.user.id,
      raidId,
      characterId: charId,
      type: flow.type ?? 'normal',
      signedSpec: cfg.selectedSpec ?? char.mainSpec,
      punctuality: flow.punctuality ?? 'on_time',
      note,
      forbidReserve: flow.type === 'reserve' ? false : (cfg.forbidReserve ?? false),
      onlySignedSpec: cfg.onlySignedSpec ?? false,
    });
    if (ok) {
      okCount += 1;
    } else {
      errors.push(`${char.name}: ${raidActionErrorText(json.error)}`);
    }
  }

  if (raidPostMsg && raidPostComponents.length) {
    await raidPostMsg.edit({ components: raidPostComponents }).catch(() => {});
  }

  if (errors.length > 0) {
    setJoin2Flow(interaction.user.id, raidId, { ...flow, note });
    await deleteJoin2WizardReply(interaction, flow.replyMessageId);
    await interaction.editReply({
      content: `⚠️ ${okCount} von ${selectedCharIds.length} Anmeldungen gespeichert.\n${errors.slice(0, 4).join('\n')}`,
      components: [],
    }).catch(() => {});
    if (okCount > 0) triggerRaidPostReconcile(raidId, raidPostMsg);
    scheduleDeleteSingleEphemeralReply(interaction);
    return;
  }

  clearJoin2Flow(interaction.user.id, raidId);
  raidPostMessages.delete(`${interaction.user.id}:${raidId}`);
  await deleteJoin2WizardReply(interaction, flow.replyMessageId);
  await interaction.editReply({
    content: `✅ ${okCount} Charakter${okCount === 1 ? '' : 'e'} erfolgreich angemeldet.`,
    components: [],
  }).catch(() => {});
  triggerRaidPostReconcile(raidId, raidPostMsg);
  scheduleDeleteSingleEphemeralReply(interaction);
}

function loadEditFlowFromSignup(userId, raidId, signup, emojis, signupPhase = 'full', raidStatus = 'open', locale = 'de') {
  const char = signup.character;
  const storedType = signup.type ?? 'normal';
  const type = signupPhase === 'reserve_only' ? 'reserve' : storedType;
  setEditFlow(userId, raidId, {
    charId: char?.id, charName: char?.name ?? '?',
    mainSpec: char?.mainSpec ?? '?', offSpec: char?.offSpec ?? null,
    selectedSpec: signup.signedSpec ?? char?.mainSpec ?? '?',
    selectedPunc: signup.punctuality ?? 'on_time',
    existingNote: signup.note ?? '',
    emojis,
    signupPhase,
    raidStatus,
    setConfirmed: signup.setConfirmed === true,
    type, forbidReserve: false, onlySignedSpec: false,
    locale,
  });
}

async function handleRaidEditButton(interaction, raidId) {
  // Raid-Post merken damit handleSubmitEdit die Buttons sperren/entsperren kann
  raidPostMessages.set(`${interaction.user.id}:${raidId}`, interaction.message);
  const raidPostMsg = interaction.message;
  const raidPostOrig = raidPostMsg?.components ?? [];
  await interaction.deferReply({ ephemeral: true }).catch(() => {});
  if (raidPostMsg && raidPostOrig.length) {
    await disableRaidPostButtons(raidPostMsg).catch(() => {});
  }
  const prep = await ensureRaidParticipant(interaction, raidId, {
    requireCharacters: false,
    raidPostMsg,
    raidPostOrig,
  });
  if (!prep.ok) return;
  const locale = prep.locale ?? botLocale(interaction, prep.state);
  const { ok, json } = await getDiscordAction({
    action: 'get-signup',
    discordUserId: interaction.user.id,
    raidId,
    ...(interaction.channelId ? { discordChannelId: interaction.channelId } : {}),
  });
  if (!ok || json.linked === false) {
    await restoreRaidPostComponents(raidPostMsg, raidPostOrig);
    await interaction.editReply({ content: raidActionErrorText('NOT_LINKED', undefined, locale), components: [] }).catch(() => {});
    scheduleDeleteSingleEphemeralReply(interaction);
    return;
  }
  const signups = Array.isArray(json.signups) ? json.signups : [];
  const signupPhase = json.signupPhase ?? 'full';
  if (signups.length === 0) {
    await restoreRaidPostComponents(raidPostMsg, raidPostOrig);
    await interaction.editReply({ content: `⚠️ ${raidBotMessage(locale, 'NO_ACTIVE_SIGNUP')}`, components: [] }).catch(() => {});
    scheduleDeleteSingleEphemeralReply(interaction);
    return;
  }
  await restoreRaidPostComponents(raidPostMsg, raidPostOrig);
  const emojis = json.discordEmojis ?? {};
  const raidStatus = json.raidStatus ?? 'open';
  const guestLocale = botLocale(interaction, { discordGuestChannelId: json.discordGuestChannelId ?? prep.state?.discordGuestChannelId });
  if (signups.length === 1) {
    loadEditFlowFromSignup(interaction.user.id, raidId, signups[0], emojis, signupPhase, raidStatus, guestLocale);
    const msg = await buildEditConfigMessage(raidId, getEditFlow(interaction.user.id, raidId));
    await interaction.editReply({ content: msg.content, components: msg.components }).catch(() => {});
    return;
  }
  // Mehrere Anmeldungen → Charakter-Auswahl
  const { StringSelectMenuBuilder, ActionRowBuilder } = await import('discord.js');
  setEditFlow(interaction.user.id, raidId, { _pendingSignups: signups, emojis, signupPhase, raidStatus, locale: guestLocale });
  const raidNoDash = raidId.replace(/-/g, '');
  const select = new StringSelectMenuBuilder()
    .setCustomId(`rf:seleditchar:${raidNoDash}`)
    .setPlaceholder(raidBotMessage(guestLocale, 'EDIT_PICK_PLACEHOLDER'))
    .addOptions(signups.slice(0, 25).map(s => ({
      label:       truncateDiscordLabel(`${s.character?.name ?? '?'} (${s.signedSpec ?? s.character?.mainSpec ?? '?'})`, 100),
      value:       s.id,
      description: s.type === 'reserve' ? raidBotMessage(guestLocale, 'RESERVE') : raidBotMessage(guestLocale, 'NORMAL'),
    })));
  await interaction.editReply({
    content:    raidBotMessage(guestLocale, 'EDIT_PICK'),
    components: [new ActionRowBuilder().addComponents(select)],
  }).catch(() => {});
}

async function handleEditCharSelect(interaction, raidId) {
  const signupId = interaction.values?.[0];
  if (!signupId) { await interaction.reply({ content: '❌ Keine Auswahl.', ephemeral: true }).catch(() => {}); return; }
  const pending = getEditFlow(interaction.user.id, raidId);
  const signups = pending?._pendingSignups ?? [];
  const signup  = signups.find(s => s.id === signupId);
  if (!signup) { await interaction.reply({ content: '⚠️ Auswahl ungültig. Bitte erneut versuchen.', ephemeral: true }).catch(() => {}); return; }
  loadEditFlowFromSignup(
    interaction.user.id,
    raidId,
    signup,
    pending?.emojis ?? {},
    pending?.signupPhase ?? 'full',
    pending?.raidStatus ?? 'open',
    pending?.locale ?? botLocale(interaction, null),
  );
  const msg = await buildEditConfigMessage(raidId, getEditFlow(interaction.user.id, raidId));
  await interaction.update(msg).catch(() => {});
}

async function showUnregModal(interaction, raidNoDash, target, reasonRequired = false, locale = 'de') {
  const modal = new ModalBuilder()
    .setCustomId(`rfm:unreg:${raidNoDash}:${target}`)
    .setTitle(raidBotMessage(locale, 'UNREG_MODAL_TITLE'));
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel(
          reasonRequired
            ? raidBotMessage(locale, 'UNREG_REASON_SET')
            : raidBotMessage(locale, 'UNREG_REASON_LATE'),
        )
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(reasonRequired)
        .setMaxLength(500)
        .setPlaceholder(raidBotMessage(locale, 'UNREG_PLACEHOLDER')),
    ),
  );
  await interaction.showModal(modal).catch(() => {});
}

async function handleRaidUnregButton(interaction, raidId) {
  const { ok, json } = await getDiscordAction({
    action: 'get-signup',
    discordUserId: interaction.user.id,
    raidId,
    ...(interaction.channelId ? { discordChannelId: interaction.channelId } : {}),
  });
  const guestLocale = botLocale(interaction, { discordGuestChannelId: json?.discordGuestChannelId });
  if (!ok || json.linked === false) {
    await interaction.reply({ content: raidActionErrorText('NOT_LINKED', undefined, guestLocale), ephemeral: true }).catch(() => {});
    scheduleDeleteSingleEphemeralReply(interaction);
    return;
  }
  const signups    = Array.isArray(json.signups) ? json.signups : [];
  const activeSignups = signups.filter((s) => s.type !== 'declined');
  const raidNoDash = raidId.replace(/-/g, '');
  const reasonRequired =
    json.raidStatus === 'announced' && activeSignups.some((s) => s.setConfirmed);

  if (activeSignups.length === 0) {
    await interaction.reply({ content: raidActionErrorText('NOT_SIGNED_UP', undefined, guestLocale), ephemeral: true }).catch(() => {});
    scheduleDeleteSingleEphemeralReply(interaction);
    return;
  }
  if (activeSignups.length === 1) {
    await showUnregModal(interaction, raidNoDash, activeSignups[0].id.replace(/-/g, ''), reasonRequired, guestLocale);
    return;
  }
  await interaction.deferReply({ ephemeral: true }).catch(() => {});
  const { StringSelectMenuBuilder, ActionRowBuilder } = await import('discord.js');
  const options = [
    {
      label: raidBotMessage(guestLocale, 'UNREG_ALL'),
      value: 'alle',
      description: raidBotMessage(guestLocale, 'SIGNUP_COUNT', { n: activeSignups.length }),
    },
    ...activeSignups.slice(0, 24).map(s => ({
      label:       truncateDiscordLabel(`${s.character?.name ?? '?'} (${s.signedSpec ?? s.character?.mainSpec ?? '?'})`, 100),
      value:       s.id,
      description: s.type === 'reserve' ? raidBotMessage(guestLocale, 'RESERVE') : raidBotMessage(guestLocale, 'NORMAL'),
    })),
  ];
  const select = new StringSelectMenuBuilder()
    .setCustomId(`rf:selunreg:${raidNoDash}`)
    .setPlaceholder(raidBotMessage(guestLocale, 'UNREG_PICK_PLACEHOLDER'))
    .addOptions(options);
  await interaction.editReply({
    content:    raidBotMessage(guestLocale, 'UNREG_PICK'),
    components: [new ActionRowBuilder().addComponents(select)],
  }).catch(() => {});
}

async function handleUnregCharSelect(interaction, raidId) {
  const target = interaction.values?.[0];
  const locale = botLocale(interaction, null);
  if (!target) {
    await interaction.reply({ content: raidBotMessage(locale, 'NO_SELECTION'), ephemeral: true }).catch(() => {});
    return;
  }
  const raidNoDash     = raidId.replace(/-/g, '');
  const targetEncoded  = target === 'alle' ? 'alle' : target.replace(/-/g, '');
  const { ok: okSu, json: jsonSu } = await getDiscordAction({
    action: 'get-signup',
    discordUserId: interaction.user.id,
    raidId,
    ...(interaction.channelId ? { discordChannelId: interaction.channelId } : {}),
  });
  const guestLocale = botLocale(interaction, { discordGuestChannelId: jsonSu?.discordGuestChannelId });
  const su = okSu && Array.isArray(jsonSu.signups) ? jsonSu.signups : [];
  const targetNorm = target === 'alle' ? 'alle' : target.replace(/-/g, '');
  const reasonRequiredUnreg =
    jsonSu?.raidStatus === 'announced' &&
    (targetNorm === 'alle'
      ? su.some((s) => s.setConfirmed)
      : su.some((s) => s.setConfirmed && s.id.replace(/-/g, '') === targetNorm));
  await showUnregModal(interaction, raidNoDash, targetEncoded, reasonRequiredUnreg, guestLocale);
}

// --- Select-Menü-Handler ----------------------------------------------------

async function handleRaidCharSelect(interaction, raidId) {
  const charId = interaction.values?.[0];
  if (!charId) { await interaction.reply({ content: '❌ Keine Auswahl.', ephemeral: true }).catch(() => {}); return; }
  // Emojis aus dem vorherigen Pending-State übernehmen
  const pending = getJoinFlow(interaction.user.id, raidId);
  const emojis  = pending?.emojis ?? {};
  const chars   = pending?._pendingChars ?? [];
  const signupPhase = pending?.signupPhase ?? 'full';
  const locale = pending?.locale ?? botLocale(interaction, null);
  const char    = chars.find(c => c.id === charId) ?? { id: charId, name: '?', mainSpec: '', offSpec: null };
  const initialType = signupPhase === 'reserve_only' ? 'reserve' : 'normal';
  setJoinFlow(interaction.user.id, raidId, {
    charId: char.id, charName: char.name, mainSpec: char.mainSpec, offSpec: char.offSpec ?? null,
    selectedSpec: char.mainSpec, selectedPunc: 'on_time', note: '', emojis,
    signupPhase,
    type: initialType, forbidReserve: false, onlySignedSpec: false,
    locale,
  });
  const msg = await buildJoinConfigMessage(raidId, getJoinFlow(interaction.user.id, raidId));
  await interaction.update(msg).catch(() => {});
}

// --- Optionen-Toggle-Handler (Join-Flow) ------------------------------------

async function handleJoinTypeToggle(interaction, raidId) {
  const flow = getJoinFlow(interaction.user.id, raidId);
  if (!flow) { await interaction.reply({ content: '⚠️ Sitzung abgelaufen.', ephemeral: true }).catch(() => {}); return; }
  const phase = flow.signupPhase ?? 'full';
  const newType = advanceJoinSignUpType(flow.type ?? 'normal', phase);
  setJoinFlow(interaction.user.id, raidId, { ...flow, type: newType, forbidReserve: newType === 'reserve' ? false : flow.forbidReserve });
  const msg = await buildJoinConfigMessage(raidId, getJoinFlow(interaction.user.id, raidId));
  await interaction.update(msg).catch(() => {});
}

async function handleJoinForbidRes(interaction, raidId) {
  const flow = getJoinFlow(interaction.user.id, raidId);
  if (!flow) { await interaction.reply({ content: '⚠️ Sitzung abgelaufen.', ephemeral: true }).catch(() => {}); return; }
  setJoinFlow(interaction.user.id, raidId, { ...flow, forbidReserve: !flow.forbidReserve });
  const msg = await buildJoinConfigMessage(raidId, getJoinFlow(interaction.user.id, raidId));
  await interaction.update(msg).catch(() => {});
}

async function handleJoinOnlySpec(interaction, raidId) {
  const flow = getJoinFlow(interaction.user.id, raidId);
  if (!flow) { await interaction.reply({ content: '⚠️ Sitzung abgelaufen.', ephemeral: true }).catch(() => {}); return; }
  setJoinFlow(interaction.user.id, raidId, { ...flow, onlySignedSpec: !flow.onlySignedSpec });
  const msg = await buildJoinConfigMessage(raidId, getJoinFlow(interaction.user.id, raidId));
  await interaction.update(msg).catch(() => {});
}

// --- Optionen-Toggle-Handler (Edit-Flow) ------------------------------------

async function handleEditTypeToggle(interaction, raidId) {
  const state = getEditFlow(interaction.user.id, raidId);
  if (!state) { await interaction.reply({ content: '⚠️ Sitzung abgelaufen.', ephemeral: true }).catch(() => {}); return; }
  const phase = state.signupPhase ?? 'full';
  const newType = advanceJoinSignUpType(state.type ?? 'normal', phase);
  setEditFlow(interaction.user.id, raidId, { ...state, type: newType, forbidReserve: newType === 'reserve' ? false : state.forbidReserve });
  const msg = await buildEditConfigMessage(raidId, getEditFlow(interaction.user.id, raidId));
  await interaction.update(msg).catch(() => {});
}

async function handleEditForbidRes(interaction, raidId) {
  const state = getEditFlow(interaction.user.id, raidId);
  if (!state) { await interaction.reply({ content: '⚠️ Sitzung abgelaufen.', ephemeral: true }).catch(() => {}); return; }
  setEditFlow(interaction.user.id, raidId, { ...state, forbidReserve: !state.forbidReserve });
  const msg = await buildEditConfigMessage(raidId, getEditFlow(interaction.user.id, raidId));
  await interaction.update(msg).catch(() => {});
}

async function handleEditOnlySpec(interaction, raidId) {
  const state = getEditFlow(interaction.user.id, raidId);
  if (!state) { await interaction.reply({ content: '⚠️ Sitzung abgelaufen.', ephemeral: true }).catch(() => {}); return; }
  setEditFlow(interaction.user.id, raidId, { ...state, onlySignedSpec: !state.onlySignedSpec });
  const msg = await buildEditConfigMessage(raidId, getEditFlow(interaction.user.id, raidId));
  await interaction.update(msg).catch(() => {});
}

async function handleSpecButton(interaction, raidId, specIdx) {
  const flow = getJoinFlow(interaction.user.id, raidId);
  if (!flow) { await interaction.reply({ content: '⚠️ Sitzung abgelaufen. Bitte erneut auf Anmelden klicken.', ephemeral: true }).catch(() => {}); return; }
  const specs       = [flow.mainSpec, flow.offSpec].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  const selectedSpec = specs[parseInt(specIdx, 10)];
  if (!selectedSpec) return;
  setJoinFlow(interaction.user.id, raidId, { ...flow, selectedSpec });
  const msg = await buildJoinConfigMessage(raidId, getJoinFlow(interaction.user.id, raidId));
  await interaction.update(msg).catch(() => {});
}

async function handleEditSpecButton(interaction, raidId, specIdx) {
  const state = getEditFlow(interaction.user.id, raidId);
  if (!state) { await interaction.reply({ content: '⚠️ Sitzung abgelaufen.', ephemeral: true }).catch(() => {}); return; }
  const specs        = [state.mainSpec, state.offSpec].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  const selectedSpec = specs[parseInt(specIdx, 10)];
  if (!selectedSpec) return;
  setEditFlow(interaction.user.id, raidId, { ...state, selectedSpec });
  const msg = await buildEditConfigMessage(raidId, getEditFlow(interaction.user.id, raidId));
  await interaction.update(msg).catch(() => {});
}

// --- Pünktlichkeit-Button-Handler -------------------------------------------

async function handlePuncButton(interaction, raidId, punc) {
  const flow = getJoinFlow(interaction.user.id, raidId);
  if (!flow) { await interaction.reply({ content: '⚠️ Sitzung abgelaufen. Bitte erneut auf Anmelden klicken.', ephemeral: true }).catch(() => {}); return; }
  setJoinFlow(interaction.user.id, raidId, { ...flow, selectedPunc: punc });
  const msg = await buildJoinConfigMessage(raidId, getJoinFlow(interaction.user.id, raidId));
  await interaction.update(msg).catch(() => {});
}

async function handleEditPuncButton(interaction, raidId, punc) {
  const state = getEditFlow(interaction.user.id, raidId);
  if (!state) { await interaction.reply({ content: '⚠️ Sitzung abgelaufen.', ephemeral: true }).catch(() => {}); return; }
  setEditFlow(interaction.user.id, raidId, { ...state, selectedPunc: punc });
  const msg = await buildEditConfigMessage(raidId, getEditFlow(interaction.user.id, raidId));
  await interaction.update(msg).catch(() => {});
}

// --- Submit-Handler ---------------------------------------------------------

async function handleSubmitJoin(interaction, raidId, charId) {
  const flow = getJoinFlow(interaction.user.id, raidId);
  const locale = flow?.locale ?? botLocale(interaction, null);
  if (!flow?.selectedSpec) {
    await interaction.reply({ content: raidBotMessage(locale, 'PICK_SPEC'), ephemeral: true }).catch(() => {});
    scheduleDeleteSingleEphemeralReply(interaction);
    return;
  }
  if (flow.selectedPunc === 'late' && !flow.note?.trim()) {
    const msg = await buildJoinConfigMessage(raidId, flow, raidBotMessage(locale, 'LATE_NOTE_REQUIRED'));
    await interaction.update(msg).catch(() => {});
    return;
  }
  await interaction.deferUpdate().catch(() => {});
  await interaction.editReply({ content: raidBotMessage(locale, 'LOADING_JOIN'), components: [] }).catch(() => {});

  const raidPostMsg        = raidPostMessages.get(`${interaction.user.id}:${raidId}`) ?? null;
  const raidPostComponents = raidPostMsg?.components ?? [];
  if (raidPostMsg && raidPostComponents.length) {
    await disableRaidPostButtons(raidPostMsg).catch(() => {});
  }

  const { ok, json } = await callDiscordAction({
    action: 'join', discordUserId: interaction.user.id, raidId,
    characterId: flow.charId,
    type:          flow.type         ?? 'normal',
    signedSpec:    flow.selectedSpec,
    punctuality:   flow.selectedPunc ?? 'on_time',
    note:          flow.note         ?? '',
    forbidReserve: flow.forbidReserve  ?? false,
    onlySignedSpec: flow.onlySignedSpec ?? false,
  }, interaction);
  if (!ok) {
    if (raidPostMsg && raidPostComponents.length) {
      await raidPostMsg.edit({ components: raidPostComponents }).catch(() => {});
    }
    await interaction.editReply({ content: raidActionErrorText(json.error, json, locale), components: [] }).catch(() => {});
    scheduleDeleteSingleEphemeralReply(interaction);
    return;
  }
  clearJoinFlow(interaction.user.id, raidId);
  raidPostMessages.delete(`${interaction.user.id}:${raidId}`);
  if (raidPostMsg && raidPostComponents.length) {
    await raidPostMsg.edit({ components: raidPostComponents }).catch(() => {});
  }
  await interaction.editReply({ content: `✅ ${json.message ?? raidBotMessage(locale, 'SIGNUP_OK')}`, components: [] }).catch(() => {});
  if (ok) triggerRaidPostReconcile(raidId, raidPostMsg);
  scheduleDeleteSingleEphemeralReply(interaction);
}

async function handleSubmitEdit(interaction, raidId) {
  const state = getEditFlow(interaction.user.id, raidId);
  const locale = state?.locale ?? botLocale(interaction, null);
  if (!state) {
    await interaction.reply({ content: raidBotMessage(locale, 'SESSION_EXPIRED'), ephemeral: true }).catch(() => {});
    scheduleDeleteSingleEphemeralReply(interaction);
    return;
  }
  if (state.selectedPunc === 'late' && !state.existingNote?.trim()) {
    const msg = await buildEditConfigMessage(raidId, state, raidBotMessage(locale, 'LATE_NOTE_REQUIRED_EDIT'));
    await interaction.update(msg).catch(() => {});
    return;
  }
  const editType = state.type ?? 'normal';
  if (
    state.raidStatus === 'announced' &&
    state.setConfirmed &&
    (editType === 'reserve' || editType === 'declined') &&
    (state.existingNote ?? '').trim().length < ANNOUNCED_SET_PLAYER_COMMENT_MIN
  ) {
    const msg = await buildEditConfigMessage(
      raidId,
      state,
      raidBotMessage(locale, 'SET_PLAYER_REASON_EDIT', { min: ANNOUNCED_SET_PLAYER_COMMENT_MIN }),
    );
    await interaction.update(msg).catch(() => {});
    return;
  }
  await interaction.deferUpdate().catch(() => {});
  await interaction.editReply({ content: raidBotMessage(locale, 'LOADING_EDIT'), components: [] }).catch(() => {});

  const raidPostMsg        = raidPostMessages.get(`${interaction.user.id}:${raidId}`) ?? null;
  const raidPostComponents = raidPostMsg?.components ?? [];
  if (raidPostMsg && raidPostComponents.length) {
    await disableRaidPostButtons(raidPostMsg).catch(() => {});
  }

  const discordUserLabel =
    interaction.member?.displayName?.trim() ||
    interaction.user.globalName?.trim() ||
    interaction.user.username;

  const { ok, json } = await callDiscordAction({
    action: 'edit-signup',
    discordUserId: interaction.user.id,
    raidId,
    characterId:    state.charId,
    type:           state.type          ?? 'normal',
    signedSpec:     state.selectedSpec,
    punctuality:    state.selectedPunc  ?? 'on_time',
    note:           state.existingNote  ?? '',
    forbidReserve:  state.forbidReserve  ?? false,
    onlySignedSpec: state.onlySignedSpec ?? false,
    discordUserLabel,
  }, interaction);
  if (!ok) {
    if (raidPostMsg && raidPostComponents.length) {
      await raidPostMsg.edit({ components: raidPostComponents }).catch(() => {});
    }
    await interaction.editReply({ content: raidActionOutcome(false, json, '', locale), components: [] }).catch(() => {});
    scheduleDeleteSingleEphemeralReply(interaction);
    return;
  }
  clearEditFlow(interaction.user.id, raidId);
  raidPostMessages.delete(`${interaction.user.id}:${raidId}`);
  if (raidPostMsg && raidPostComponents.length) {
    await raidPostMsg.edit({ components: raidPostComponents }).catch(() => {});
  }
  await interaction.editReply({ content: `✅ ${json.message ?? raidBotMessage(locale, 'SIGNUP_UPDATED')}`, components: [] }).catch(() => {});
  if (ok) triggerRaidPostReconcile(raidId, raidPostMsg);
  scheduleDeleteSingleEphemeralReply(interaction);
}

// --- Notiz-Modal (Join-Flow) -------------------------------------------------

async function handleJoinNoteButton(interaction, raidId) {
  const flow = getJoinFlow(interaction.user.id, raidId);
  const locale = flow?.locale ?? botLocale(interaction, null);
  const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
  const modal = new ModalBuilder()
    .setCustomId(`rfm:joinnote:${raidId.replace(/-/g, '')}`)
    .setTitle(raidBotMessage(locale, 'NOTE_MODAL_JOIN_TITLE'));
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('note').setLabel(raidBotMessage(locale, 'NOTE_MODAL_LABEL'))
        .setStyle(TextInputStyle.Paragraph).setValue(flow?.note ?? '').setRequired(false).setMaxLength(500)
        .setPlaceholder(raidBotMessage(locale, 'NOTE_MODAL_PLACEHOLDER'))
    ),
  );
  await interaction.showModal(modal).catch(() => {});
}

async function handleEditNoteButton(interaction, raidId) {
  const state = getEditFlow(interaction.user.id, raidId);
  const locale = state?.locale ?? botLocale(interaction, null);
  const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
  const modal = new ModalBuilder()
    .setCustomId(`rfm:editnote:${raidId.replace(/-/g, '')}`)
    .setTitle(raidBotMessage(locale, 'NOTE_MODAL_EDIT_TITLE'));
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('note').setLabel(raidBotMessage(locale, 'NOTE_MODAL_LABEL'))
        .setStyle(TextInputStyle.Paragraph).setValue(state?.existingNote ?? '').setRequired(false).setMaxLength(500)
        .setPlaceholder(raidBotMessage(locale, 'NOTE_MODAL_PLACEHOLDER'))
    ),
  );
  await interaction.showModal(modal).catch(() => {});
}

// --- Modal-Handler ----------------------------------------------------------

async function handleRaidUnregModal(interaction, raidId) {
  await interaction.deferReply({ ephemeral: true }).catch(() => {});
  const { ok: stOk, json: stJson } = await fetchRaidParticipantState(interaction, raidId);
  const locale = stOk ? botLocale(interaction, stJson) : botLocale(interaction, null);
  const reason = interaction.fields.getTextInputValue('reason').trim();

  // parts: rfm:unreg:<raidNoDash>:<target>
  const parts       = interaction.customId.split(':');
  const targetRaw   = parts[3]; // undefined, 'alle', or signupId-no-dash
  let signupId;
  if (targetRaw && targetRaw !== 'alle') {
    signupId = noDashToUuid(targetRaw);
  }

  const discordUserLabel =
    interaction.member?.displayName?.trim() ||
    interaction.user.globalName?.trim() ||
    interaction.user.username;

  const { ok, json } = await callDiscordAction({
    action: 'unregister',
    discordUserId: interaction.user.id,
    raidId,
    reason,
    discordUserLabel,
    ...(signupId ? { signupId } : {}),
  }, interaction);
  const outcome = ok
    ? `✅ ${json.message ?? raidBotMessage(locale, 'UNREGISTER_OK')}`
    : raidActionErrorText(json.error, json, locale);
  await interaction.editReply({ content: outcome, components: [] }).catch(() => {});
  if (ok) triggerRaidPostReconcile(raidId, null);
  scheduleDeleteSingleEphemeralReply(interaction);
}

async function handleJoinNoteModal(interaction, raidId) {
  const note = interaction.fields.getTextInputValue('note').trim();
  const flow = getJoinFlow(interaction.user.id, raidId);
  const locale = flow?.locale ?? botLocale(interaction, null);
  if (flow) setJoinFlow(interaction.user.id, raidId, { ...flow, note });
  const detail = note ? `: "${note.slice(0, 60)}"` : raidBotMessage(locale, 'NOTE_EMPTY');
  await interaction.reply({
    content:   raidBotMessage(locale, 'NOTE_SAVED_JOIN', { detail }),
    ephemeral: true,
  }).catch(() => {});
  scheduleDeleteSingleEphemeralReply(interaction);
}

async function handleEditNoteModal(interaction, raidId) {
  const note = interaction.fields.getTextInputValue('note').trim();
  const state = getEditFlow(interaction.user.id, raidId);
  const locale = state?.locale ?? botLocale(interaction, null);
  if (state) setEditFlow(interaction.user.id, raidId, { ...state, existingNote: note });
  const detail = note ? `: "${note.slice(0, 60)}"` : raidBotMessage(locale, 'NOTE_EMPTY');
  await interaction.reply({
    content:   raidBotMessage(locale, 'NOTE_SAVED_EDIT', { detail }),
    ephemeral: true,
  }).catch(() => {});
  scheduleDeleteSingleEphemeralReply(interaction);
}

// ---------------------------------------------------------------------------
// RaidTools & Info @ Raidlead
// ---------------------------------------------------------------------------

function buildOptionsMenuComponents(raidId, guildId, locale) {
  const rid = raidId.replace(/-/g, '');
  const gid = guildId.replace(/-/g, '');
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`rf:optstools:${rid}`)
        .setLabel(raidBotMessage(locale, 'OPTIONS_RAID_TOOLS'))
        .setEmoji('🛠️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`rf:optschar:${rid}:${gid}`)
        .setLabel(raidBotMessage(locale, 'OPTIONS_ADD_CHAR'))
        .setEmoji('👤')
        .setStyle(ButtonStyle.Primary),
    ),
  ];
}

function buildRaidToolsMenuComponents(raidId, locale) {
  const rid = raidId.replace(/-/g, '');
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`rf:toolsync:${rid}`)
        .setLabel(raidBotMessage(locale, 'RAIDTOOLS_SYNC'))
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`rf:toolpush:${rid}`)
        .setLabel(raidBotMessage(locale, 'RAIDTOOLS_PUSH'))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`rf:toolpushm:${rid}`)
        .setLabel(raidBotMessage(locale, 'RAIDTOOLS_PUSH_MENTION'))
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

async function replyRaidToolsMenu(interaction, raidId, locale) {
  let ok = false;
  let json = {};
  try {
    ({ ok, json } = await getDiscordAction({
      action: 'get-raid-tools',
      discordUserId: interaction.user.id,
      raidId,
      ...(interaction.channelId ? { discordChannelId: interaction.channelId } : {}),
    }));
  } catch (e) {
    console.error('[RaidTools] get-raid-tools', e);
    await interaction.editReply({ content: `❌ ${raidBotMessage(locale, 'BACKEND_FAILED')}`, components: [] }).catch(() => {});
    scheduleDeleteSingleEphemeralReply(interaction);
    return;
  }

  const guestLocale = botLocale(interaction, { discordGuestChannelId: json?.discordGuestChannelId });

  if (!ok || !json.linked) {
    await interaction.editReply({ content: raidActionErrorText('NOT_LINKED', undefined, guestLocale), components: [] }).catch(() => {});
    scheduleDeleteSingleEphemeralReply(interaction);
    return;
  }
  if (!json.canManage) {
    await interaction.editReply({ content: raidToolsErrorText('FORBIDDEN', guestLocale), components: [] }).catch(() => {});
    scheduleDeleteSingleEphemeralReply(interaction);
    return;
  }

  await interaction.editReply({
    content: raidBotMessage(guestLocale, 'RAIDTOOLS_TITLE'),
    components: buildRaidToolsMenuComponents(raidId, guestLocale),
  }).catch(() => {});
}

async function handleRaidOptionsButton(interaction, raidId, guildId) {
  await interaction.deferReply({ ephemeral: true }).catch(() => {});
  const { ok, json } = await fetchRaidParticipantState(interaction, raidId);
  const locale = ok ? botLocale(interaction, json) : botLocale(interaction, null);
  const resolvedGuildId = guildId || json?.raidGuildId || '';
  if (!resolvedGuildId) {
    await interaction.editReply({ content: `❌ ${raidBotMessage(locale, 'BACKEND_FAILED')}`, components: [] }).catch(() => {});
    scheduleDeleteSingleEphemeralReply(interaction);
    return;
  }

  await interaction.editReply({
    content: raidBotMessage(locale, 'OPTIONS_TITLE'),
    components: buildOptionsMenuComponents(raidId, resolvedGuildId, locale),
  }).catch(() => {});
}

async function handleRaidOptionsToolsButton(interaction, raidId) {
  await interaction.deferUpdate().catch(() => {});
  const locale = botLocale(interaction, null);
  await replyRaidToolsMenu(interaction, raidId, locale);
}

async function handleRaidOptionsAddCharButton(interaction, raidId, guildId) {
  await interaction.deferUpdate().catch(() => {});
  const { ok, json } = await fetchRaidParticipantState(interaction, raidId);
  const locale = ok ? botLocale(interaction, json) : botLocale(interaction, null);

  if (!ok) {
    await interaction.editReply({ content: `❌ ${raidBotMessage(locale, 'BACKEND_FAILED')}`, components: [] }).catch(() => {});
    scheduleDeleteSingleEphemeralReply(interaction);
    return;
  }
  if (!json.linked) {
    await interaction.editReply({ content: raidActionErrorText('NOT_LINKED', undefined, locale), components: [] }).catch(() => {});
    scheduleDeleteSingleEphemeralReply(interaction);
    return;
  }

  await startCharOnboarding(
    interaction,
    raidId,
    json,
    { assignPurpose: 'addchar', locale },
    charOnboardingDeps(),
  );
}

async function handleRaidToolsButton(interaction, raidId) {
  await interaction.deferReply({ ephemeral: true }).catch(() => {});
  const locale = botLocale(interaction, null);
  await replyRaidToolsMenu(interaction, raidId, locale);
}

async function handleRaidToolRun(interaction, raidId, action) {
  await interaction.deferUpdate().catch(() => interaction.deferReply({ ephemeral: true }).catch(() => {}));
  const locale = botLocale(interaction, null);
  await interaction.editReply({
    content: raidBotMessage(locale, 'RAIDTOOLS_LOADING'),
    components: [],
  }).catch(() => {});

  let ok = false;
  let json = {};
  try {
    ({ ok, json } = await callDiscordAction({
      action,
      discordUserId: interaction.user.id,
      raidId,
    }, interaction));
  } catch (e) {
    console.error('[RaidToolRun]', action, e);
    await interaction.editReply({ content: `❌ ${raidBotMessage(locale, 'BACKEND_FAILED')}`, components: [] }).catch(() => {});
    scheduleDeleteSingleEphemeralReply(interaction);
    return;
  }

  const outcome = ok
    ? `✅ ${json.message ?? raidBotMessage(locale, 'DONE')}`
    : raidToolsErrorText(json.error, locale);
  await interaction.editReply({ content: outcome, components: [] }).catch(() => {});
  scheduleDeleteSingleEphemeralReply(interaction);
}

async function handleRaidToolPushMentionButton(interaction, raidId) {
  const locale = botLocale(interaction, null);
  await showRaidPushMentionModal(interaction, raidId, locale).catch(() => {});
}

async function handleRaidToolsSelect(interaction, raidId) {
  // Legacy: alte Select-Menüs auf bestehenden Posts
  const tool = interaction.values[0];

  if (tool === 'push-mention') {
    await handleRaidToolPushMentionButton(interaction, raidId);
    return;
  }

  await interaction.deferUpdate().catch(() => interaction.deferReply({ ephemeral: true }).catch(() => {}));
  const action = tool === 'push' ? 'push-raid' : 'sync-post';
  const locale = botLocale(interaction, null);
  let ok = false;
  let json = {};
  try {
    ({ ok, json } = await callDiscordAction({
      action,
      discordUserId: interaction.user.id,
      raidId,
    }, interaction));
  } catch (e) {
    console.error('[RaidToolsSelect]', action, e);
    await interaction.editReply({ content: `❌ ${raidBotMessage(locale, 'BACKEND_FAILED')}`, components: [] }).catch(() => {});
    scheduleDeleteSingleEphemeralReply(interaction);
    return;
  }

  const outcome = ok
    ? `✅ ${json.message ?? raidBotMessage(locale, 'DONE')}`
    : raidToolsErrorText(json.error, locale);
  await interaction.editReply({ content: outcome, components: [] }).catch(() => {});
  scheduleDeleteSingleEphemeralReply(interaction);
}

function showRaidPushMentionModal(interaction, raidId, locale = 'de') {
  const raidNoDash = raidId.replace(/-/g, '');
  const modal = new ModalBuilder()
    .setCustomId(`rfm:pushmention:${raidNoDash}`)
    .setTitle(raidBotMessage(locale, 'PUSH_MENTION_MODAL_TITLE'));
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('mentionText')
        .setLabel(raidBotMessage(locale, 'PUSH_MENTION_LABEL'))
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1500)
        .setPlaceholder(raidBotMessage(locale, 'PUSH_MENTION_PLACEHOLDER')),
    ),
  );
  return interaction.showModal(modal);
}

async function handleRaidPushMentionModal(interaction, raidId) {
  const mentionText = interaction.fields.getTextInputValue('mentionText').trim();
  await interaction.deferReply({ ephemeral: true }).catch(() => {});
  const { ok: stOk, json: stJson } = await fetchRaidParticipantState(interaction, raidId);
  const locale = stOk ? botLocale(interaction, stJson) : botLocale(interaction, null);

  const { ok, json } = await callDiscordAction({
    action: 'push-raid-mention',
    discordUserId: interaction.user.id,
    raidId,
    mentionText,
  }, interaction);

  const outcome = ok
    ? `✅ ${json.message ?? raidBotMessage(locale, 'PUSH_MENTION_OK')}`
    : raidToolsErrorText(json.error, locale);
  await interaction.editReply({ content: outcome, components: [] }).catch(() => {});
  scheduleDeleteSingleEphemeralReply(interaction);
}

async function handleRaidInfoRlButton(interaction, raidId) {
  const { ok, json } = await fetchRaidParticipantState(interaction, raidId);
  const locale = ok ? botLocale(interaction, json) : botLocale(interaction, null);

  if (!ok || !json.hasLeaderChannel) {
    await interaction.reply({
      content: raidBotMessage(locale, 'LEADER_INFO_UNAVAILABLE'),
      ephemeral: true,
    }).catch(() => {});
    scheduleDeleteSingleEphemeralReply(interaction);
    return;
  }

  const raidNoDash = raidId.replace(/-/g, '');
  const modal = new ModalBuilder()
    .setCustomId(`rfm:rlinfo:${raidNoDash}`)
    .setTitle(raidBotMessage(locale, 'LEADER_INFO_MODAL_TITLE'));
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('message')
        .setLabel(raidBotMessage(locale, 'LEADER_INFO_MODAL_LABEL'))
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1500)
        .setPlaceholder(raidBotMessage(locale, 'LEADER_INFO_MODAL_PLACEHOLDER')),
    ),
  );
  await interaction.showModal(modal).catch(() => {});
}

async function handleRaidLeaderInfoModal(interaction, raidId) {
  const message = interaction.fields.getTextInputValue('message').trim();
  const { ok: stOk, json: stJson } = await fetchRaidParticipantState(interaction, raidId);
  const locale = stOk ? botLocale(interaction, stJson) : botLocale(interaction, null);
  const discordUserLabel =
    interaction.member?.displayName?.trim() ||
    interaction.user.globalName?.trim() ||
    interaction.user.username;

  await interaction.deferReply({ ephemeral: true }).catch(() => {});

  const { ok, json } = await callDiscordAction({
    action: 'leader-info',
    discordUserId: interaction.user.id,
    raidId,
    message,
    discordUserLabel,
  }, interaction);

  const outcome = ok
    ? `✅ ${json.message ?? raidBotMessage(locale, 'LEADER_INFO_SENT')}`
    : (json?.message ? `❌ ${json.message}` : raidToolsErrorText(json.error, locale));
  await interaction.editReply({ content: outcome }).catch(() => {});
  scheduleDeleteSingleEphemeralReply(interaction);
}

// ---------------------------------------------------------------------------
// Hilfe (Sprache → Thema → Text)
// ---------------------------------------------------------------------------

const helpFlowState = new Map();
const HELP_TTL_MS = 10 * 60 * 1000;

function helpKey(userId, raidId) {
  return `help::${userId}::${raidId}`;
}

function getHelpFlow(userId, raidId) {
  const entry = helpFlowState.get(helpKey(userId, raidId));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    helpFlowState.delete(helpKey(userId, raidId));
    return null;
  }
  return entry.data;
}

function setHelpFlow(userId, raidId, data) {
  helpFlowState.set(helpKey(userId, raidId), { data, expiresAt: Date.now() + HELP_TTL_MS });
}

const HELP_TOPIC_KEYS = ['newcomer', 'signup', 'options', 'leaderinfo', 'raidtools'];

function helpTopicButtonLabel(locale, topic) {
  const map = {
    newcomer: 'HELP_TOPIC_NEWCOMER',
    signup: 'HELP_TOPIC_SIGNUP',
    options: 'HELP_TOPIC_OPTIONS',
    leaderinfo: 'HELP_TOPIC_LEADER',
    raidtools: 'HELP_TOPIC_TOOLS',
  };
  return raidBotMessage(locale, map[topic] ?? 'HELP_TOPIC_SIGNUP');
}

function buildHelpLangButton(raidId, locale) {
  const rid = raidId.replace(/-/g, '');
  const otherLocale = locale === 'en' ? 'de' : 'en';
  return new ButtonBuilder()
    .setCustomId(`rf:helplang:${rid}`)
    .setLabel(raidBotMessage(locale, otherLocale === 'en' ? 'HELP_SWITCH_LANG_EN' : 'HELP_SWITCH_LANG_DE'))
    .setStyle(ButtonStyle.Secondary);
}

function buildHelpMenuComponents(raidId, locale) {
  const rid = raidId.replace(/-/g, '');
  const row1 = new ActionRowBuilder().addComponents(
    ...HELP_TOPIC_KEYS.slice(0, 3).map((topic) =>
      new ButtonBuilder()
        .setCustomId(`rf:helptopic:${rid}:${topic}`)
        .setLabel(helpTopicButtonLabel(locale, topic))
        .setStyle(ButtonStyle.Primary)
    ),
  );
  const row2 = new ActionRowBuilder().addComponents(
    ...HELP_TOPIC_KEYS.slice(3).map((topic) =>
      new ButtonBuilder()
        .setCustomId(`rf:helptopic:${rid}:${topic}`)
        .setLabel(helpTopicButtonLabel(locale, topic))
        .setStyle(ButtonStyle.Primary)
    ),
    buildHelpLangButton(raidId, locale),
  );
  return [row1, row2];
}

function buildHelpTopicNavComponents(raidId, locale) {
  const rid = raidId.replace(/-/g, '');
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`rf:helpback:${rid}`)
        .setLabel(raidBotMessage(locale, 'HELP_BACK'))
        .setStyle(ButtonStyle.Secondary),
      buildHelpLangButton(raidId, locale),
    ),
  ];
}

/** Keine Link-Vorschau in Hilfe-Ephemerals (z. B. Webportal-URL bei Erste Schritte). */
function helpReplyPayload(content, components = []) {
  return {
    content,
    components,
    flags: MessageFlags.SuppressEmbeds,
  };
}

async function handleRaidHelpButton(interaction, raidId) {
  await interaction.deferReply({ ephemeral: true, flags: MessageFlags.SuppressEmbeds }).catch(() => {});
  const { ok, json } = await fetchRaidParticipantState(interaction, raidId);
  const defaultLocale = ok ? botLocale(interaction, json) : botLocale(interaction, null);
  setHelpFlow(interaction.user.id, raidId, { locale: defaultLocale });

  await interaction.editReply(helpReplyPayload(
    [
      raidBotMessage(defaultLocale, 'HELP_TOPIC_TITLE'),
      raidBotMessage(defaultLocale, 'HELP_LANG_HINT', { lang: helpLangLabel(defaultLocale) }),
    ].join('\n'),
    buildHelpMenuComponents(raidId, defaultLocale),
  )).catch(() => {});
}

async function handleHelpLangButton(interaction, raidId) {
  await interaction.deferUpdate().catch(() => {});
  const flow = getHelpFlow(interaction.user.id, raidId);
  const current = flow?.locale ?? botLocale(interaction, null);
  const locale = current === 'en' ? 'de' : 'en';
  const nextFlow = { locale, view: flow?.view ?? 'menu', topic: flow?.topic };
  setHelpFlow(interaction.user.id, raidId, nextFlow);

  if (nextFlow.view === 'topic' && nextFlow.topic) {
    const content = getHelpTopicContent(locale, nextFlow.topic);
    await interaction.editReply(helpReplyPayload(
      content ?? raidBotMessage(locale, 'HELP_TOPIC_TITLE'),
      buildHelpTopicNavComponents(raidId, locale),
    )).catch(() => {});
    return;
  }

  await interaction.editReply(helpReplyPayload(
    [
      raidBotMessage(locale, 'HELP_TOPIC_TITLE'),
      raidBotMessage(locale, 'HELP_LANG_HINT', { lang: helpLangLabel(locale) }),
    ].join('\n'),
    buildHelpMenuComponents(raidId, locale),
  )).catch(() => {});
}

async function handleHelpTopicButton(interaction, raidId, topic) {
  await interaction.deferUpdate().catch(() => {});
  const flow = getHelpFlow(interaction.user.id, raidId);
  const locale = flow?.locale ?? botLocale(interaction, null);
  setHelpFlow(interaction.user.id, raidId, { locale, view: 'topic', topic });

  const content = getHelpTopicContent(locale, topic);
  if (!content) {
    await interaction.editReply(helpReplyPayload(
      locale === 'en' ? '❌ Topic not found.' : '❌ Thema nicht gefunden.',
      buildHelpMenuComponents(raidId, locale),
    )).catch(() => {});
    return;
  }
  await interaction.editReply(helpReplyPayload(
    content,
    buildHelpTopicNavComponents(raidId, locale),
  )).catch(() => {});
}

async function handleHelpBackButton(interaction, raidId) {
  await interaction.deferUpdate().catch(() => {});
  const flow = getHelpFlow(interaction.user.id, raidId);
  const locale = flow?.locale ?? botLocale(interaction, null);
  setHelpFlow(interaction.user.id, raidId, { locale, view: 'menu' });

  await interaction.editReply(helpReplyPayload(
    [
      raidBotMessage(locale, 'HELP_TOPIC_TITLE'),
      raidBotMessage(locale, 'HELP_LANG_HINT', { lang: helpLangLabel(locale) }),
    ].join('\n'),
    buildHelpMenuComponents(raidId, locale),
  )).catch(() => {});
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
    // Raid-Action-Buttons: rf:<action>:<raidNoDash>:<extra>
    if (bid.startsWith('rf:')) {
      try {
        const parts  = bid.split(':');
        const action = parts[1];
        const raidId = noDashToUuid(parts[2]);
        const extra  = parts[3] ? noDashToUuid(parts[3]) : null; // guildId oder charId
        const punc   = parts[4]; // für punc/editpunc

        if (action === 'qj')         { await handleRaidQuickjoin(interaction, raidId); return; }
        if (action === 'decl')       { await handleRaidDeclineButton(interaction, raidId); return; }
        if (action === 'declreason') { await handleRaidDeclineReasonButton(interaction, raidId); return; }
        if (action === 'join')        { await handleRaidJoinButton(interaction, raidId, extra); return; }
        if (action === 'join2')       { await handleRaidJoin2Button(interaction, raidId); return; }
        if (action === 'edit')        { await handleRaidEditButton(interaction, raidId); return; }
        if (action === 'unreg')       { await handleRaidUnregButton(interaction, raidId); return; }
        if (action === 'punc')        { await handlePuncButton(interaction, raidId, punc); return; }
        if (action === 'editpunc')    { await handleEditPuncButton(interaction, raidId, punc); return; }
        if (action === 'specbtn')     { await handleSpecButton(interaction, raidId, punc); return; }
        if (action === 'editspecbtn') { await handleEditSpecButton(interaction, raidId, punc); return; }
        if (action === 'joinnote')    { await handleJoinNoteButton(interaction, raidId); return; }
        if (action === 'jtype')       { await handleJoinTypeToggle(interaction, raidId); return; }
        if (action === 'jfr')         { await handleJoinForbidRes(interaction, raidId); return; }
        if (action === 'jos')         { await handleJoinOnlySpec(interaction, raidId); return; }
        if (action === 'etype')       { await handleEditTypeToggle(interaction, raidId); return; }
        if (action === 'efr')         { await handleEditForbidRes(interaction, raidId); return; }
        if (action === 'eos')         { await handleEditOnlySpec(interaction, raidId); return; }
        if (action === 'submit')      { await handleSubmitJoin(interaction, raidId, extra); return; }
        if (action === 'submitedit')  { await handleSubmitEdit(interaction, raidId); return; }
        if (action === 'editnote')    { await handleEditNoteButton(interaction, raidId); return; }
        if (action === 'j2next')      { await handleJoin2ToStep2(interaction, raidId); return; }
        if (action === 'j2prev')      { await handleJoin2StepNav(interaction, raidId, 'prev'); return; }
        if (action === 'j2nextchar')  { await handleJoin2StepNav(interaction, raidId, 'next'); return; }
        if (action === 'j2open')      { await handleJoin2OpenNoteModal(interaction, raidId); return; }
        if (action === 'tools')       { await handleRaidToolsButton(interaction, raidId); return; }
        if (action === 'opts')        { await handleRaidOptionsButton(interaction, raidId, extra); return; }
        if (action === 'optstools')   { await handleRaidOptionsToolsButton(interaction, raidId); return; }
        if (action === 'optschar')    { await handleRaidOptionsAddCharButton(interaction, raidId, extra); return; }
        if (action === 'toolsync')    { await handleRaidToolRun(interaction, raidId, 'sync-post'); return; }
        if (action === 'toolpush')    { await handleRaidToolRun(interaction, raidId, 'push-raid'); return; }
        if (action === 'toolpushm')   { await handleRaidToolPushMentionButton(interaction, raidId); return; }
        if (action === 'inforl')      { await handleRaidInfoRlButton(interaction, raidId); return; }
        if (action === 'help')        { await handleRaidHelpButton(interaction, raidId); return; }
        if (action === 'helplang')    { await handleHelpLangButton(interaction, raidId); return; }
        if (action === 'helpback')    { await handleHelpBackButton(interaction, raidId); return; }
        if (action === 'co') {
          const sub = parts[2];
          const coRaidId = parts[3] ? noDashToUuid(parts[3]) : null;
          if (!coRaidId) {
            await interaction.reply({ content: '❌ Ungültige Aktion.', ephemeral: true }).catch(() => {});
            return;
          }
          const coDeps = charOnboardingDeps();
          if (sub === 'open') { await handleCharOnboardingOpenModal(interaction, coRaidId, coDeps); return; }
          if (sub === 'cancel') { await handleCharOnboardingCancel(interaction, coRaidId, coDeps); return; }
          if (sub === 'confirm') { await handleCharOnboardingConfirm(interaction, coRaidId, coDeps); return; }
        }
        if (action === 'helptopic')   {
          const topic = parts[3];
          if (topic) { await handleHelpTopicButton(interaction, raidId, topic); return; }
        }

        console.warn('[RaidButton] unbekannte Aktion:', action, bid);
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: '❌ Unbekannte Aktion.', components: [] }).catch(() => {});
        } else {
          await interaction.reply({ content: '❌ Unbekannte Aktion.', ephemeral: true }).catch(() => {});
        }
      } catch (e) {
        console.error('[RaidButton]', bid, e);
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: '❌ Interner Fehler.', components: [] }).catch(() => {});
        } else {
          await interaction.reply({ content: '❌ Interner Fehler.', ephemeral: true }).catch(() => {});
        }
      }
      return;
    }
  }

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
    if (sub === 'sync') {
      if (!interaction.guild) {
        return interaction.reply({
          content: 'Dieser Befehl funktioniert nur auf einem Server (nicht in DMs).',
          ephemeral: true,
        });
      }
      await runManualGuildSync(interaction);
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
    if (customId.startsWith('rf:cospec:')) {
      const parts = customId.split(':');
      const kind = parts[2];
      const raidId = noDashToUuid(parts[3]);
      try {
        await handleCharOnboardingSpecSelect(interaction, raidId, kind, charOnboardingDeps());
      } catch (e) {
        console.error('[CharOnboardSpec]', customId, e);
        await interaction.reply({ content: '❌ Interner Fehler.', ephemeral: true }).catch(() => {});
      }
      return;
    }
    if (customId.startsWith('rf:assignchar:')) {
      const parts = customId.split(':');
      const raidId = noDashToUuid(parts[2]);
      const purpose = parts[3] ?? 'join';
      try {
        await handleAssignCharSelect(interaction, raidId, purpose);
      } catch (e) {
        console.error('[AssignCharSelect]', customId, e);
        await interaction.reply({ content: '❌ Interner Fehler.', ephemeral: true }).catch(() => {});
      }
      return;
    }
    if (customId.startsWith('rf:qjchar:')) {
      const parts = customId.split(':');
      const raidId = noDashToUuid(parts[2]);
      try {
        await handleQuickjoinCharSelect(interaction, raidId);
      } catch (e) {
        console.error('[QuickjoinCharSelect]', customId, e);
        await interaction.reply({ content: '❌ Interner Fehler.', ephemeral: true }).catch(() => {});
      }
      return;
    }
    if (customId.startsWith('rf:j2chars:')) {
      const parts = customId.split(':');
      const raidId = noDashToUuid(parts[2]);
      try {
        await handleJoin2CharsSelect(interaction, raidId);
      } catch (e) {
        console.error('[Join2CharsSelect]', customId, e);
        await interaction.reply({ content: '❌ Interner Fehler.', ephemeral: true }).catch(() => {});
      }
      return;
    }
    if (customId.startsWith('rf:j2type:')) {
      const parts = customId.split(':');
      const raidId = noDashToUuid(parts[2]);
      try {
        await handleJoin2TypeSelect(interaction, raidId);
      } catch (e) {
        console.error('[Join2TypeSelect]', customId, e);
        await interaction.reply({ content: '❌ Interner Fehler.', ephemeral: true }).catch(() => {});
      }
      return;
    }
    if (customId.startsWith('rf:j2punc:')) {
      const parts = customId.split(':');
      const raidId = noDashToUuid(parts[2]);
      try {
        await handleJoin2PuncSelect(interaction, raidId);
      } catch (e) {
        console.error('[Join2PuncSelect]', customId, e);
        await interaction.reply({ content: '❌ Interner Fehler.', ephemeral: true }).catch(() => {});
      }
      return;
    }
    if (customId.startsWith('rf:toolsel:')) {
      const parts = customId.split(':');
      const raidId = noDashToUuid(parts[2]);
      try {
        await handleRaidToolsSelect(interaction, raidId);
      } catch (e) {
        console.error('[RaidToolsSelect]', customId, e);
        await interaction.reply({ content: '❌ Interner Fehler.', ephemeral: true }).catch(() => {});
      }
      return;
    }
    if (customId.startsWith('rf:j2spec:')) {
      const parts = customId.split(':');
      const raidId = noDashToUuid(parts[2]);
      try {
        await handleJoin2SpecSelect(interaction, raidId);
      } catch (e) {
        console.error('[Join2SpecSelect]', customId, e);
        await interaction.reply({ content: '❌ Interner Fehler.', ephemeral: true }).catch(() => {});
      }
      return;
    }
    if (customId.startsWith('rf:j2opts:')) {
      const parts = customId.split(':');
      const raidId = noDashToUuid(parts[2]);
      try {
        await handleJoin2OptionsSelect(interaction, raidId);
      } catch (e) {
        console.error('[Join2OptionsSelect]', customId, e);
        await interaction.reply({ content: '❌ Interner Fehler.', ephemeral: true }).catch(() => {});
      }
      return;
    }
    // Raid Select-Menüs (rf:<action>:<raidNoDash>:...)
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
    if (customId.startsWith('rf:seleditchar:')) {
      const parts  = customId.split(':');
      const raidId = noDashToUuid(parts[2]);
      try {
        await handleEditCharSelect(interaction, raidId);
      } catch (e) {
        console.error('[EditCharSelect]', customId, e);
        await interaction.reply({ content: '❌ Interner Fehler.', ephemeral: true }).catch(() => {});
      }
      return;
    }
    if (customId.startsWith('rf:selunreg:')) {
      const parts  = customId.split(':');
      const raidId = noDashToUuid(parts[2]);
      try {
        await handleUnregCharSelect(interaction, raidId);
      } catch (e) {
        console.error('[UnregCharSelect]', customId, e);
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
    // Raid-Modals (rfm:<action>:<raidNoDash>)
    if (customId.startsWith('rfm:')) {
      const parts  = customId.split(':');
      const action = parts[1];
      const raidId = noDashToUuid(parts[2]);
      try {
        if (action === 'unreg')    { await handleRaidUnregModal(interaction, raidId); return; }
        if (action === 'joinnote') { await handleJoinNoteModal(interaction, raidId); return; }
        if (action === 'join2note') { await handleJoin2NoteModal(interaction, raidId); return; }
        if (action === 'editnote') { await handleEditNoteModal(interaction, raidId); return; }
        if (action === 'rlinfo')       { await handleRaidLeaderInfoModal(interaction, raidId); return; }
        if (action === 'pushmention')  { await handleRaidPushMentionModal(interaction, raidId); return; }
        if (action === 'decline')      { await handleRaidDeclineModal(interaction, raidId); return; }
        if (action === 'coname')       { await handleCharOnboardingNameModal(interaction, raidId, charOnboardingDeps()); return; }
      } catch (e) {
        console.error('[RaidModal]', customId, e);
        await interaction.reply({ content: '❌ Interner Fehler beim Verarbeiten.', ephemeral: true }).catch(() => {});
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
