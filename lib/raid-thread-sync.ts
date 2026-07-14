/**
 * Synchronisiert den Discord-Post eines Raids.
 *
 * Neuer Ansatz (Option C):
 *  1. Beim ersten Aufruf: Embed-Nachricht direkt im Channel posten + Thread daraus erstellen.
 *  2. Bei Updates: Embed-Nachricht PATCH (editMessageFull).
 *
 * Gespeicherte IDs auf rf_raid:
 *  - discordChannelMessageId : ID der Embed-Nachricht im Channel
 *  - discordThreadId         : ID des Diskussions-Threads (aus der Nachricht erstellt)
 *  - discordChannelId        : Parent-Channel
 */
import { prisma } from '@/lib/prisma';
import {
  createChannelMessageFull,
  createThreadFromMessage,
  deleteChannelMessage,
  editChannelMessageFull,
  fetchAllChannelMessages,
  type DiscordFetchedMessage,
} from '@/lib/discord-guild-api';
import { PRISMA_VISIBLE_SIGNUP_WHERE } from '@/lib/raid-signup-constants';
import { buildRaidActionButtons, buildGuestRaidActionButtons } from '@/lib/raid-embed-builder';
import { buildRaidDiscordEmbedsForRaid, buildGuestRaidDiscordEmbedsForRaid } from '@/lib/raid-discord-display-snapshot';
import { getAppConfig } from '@/lib/app-config';
import { roleFromSpecDisplayName } from '@/lib/spec-to-role';
import { parseStoredAnnouncedPlannerJson } from '@/lib/raid-announce';

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

async function loadRaidForSync(raidId: string) {
  return prisma.rfRaid.findUnique({
    where: { id: raidId },
    include: {
      dungeon: { select: { name: true } },
      signups: {
        where: PRISMA_VISIBLE_SIGNUP_WHERE,
        include: {
          character: {
            select: { name: true, mainSpec: true, isMain: true },
          },
        },
        orderBy: { signedAt: 'asc' },
      },
    },
  });
}

export type SyncRaidGuestChannelSummaryOptions = SyncRaidThreadSummaryOptions;

/**
 * Gast-Channel-Embed: gekürzt, eigene Message-ID.
 * Bei allowGuests=false oder fehlendem Kanal: Nachricht entfernen.
 */
export async function syncRaidGuestChannelSummary(
  raidId: string,
  opts?: SyncRaidGuestChannelSummaryOptions,
): Promise<void> {
  try {
    const raid = await loadRaidForSync(raidId);
    if (!raid) return;

    const guestChannelId = raid.discordGuestChannelId?.trim() || null;
    const shouldPost = raid.allowGuests && !!guestChannelId;

    if (raid.status === 'cancelled' || raid.status === 'completed' || !shouldPost) {
      if (raid.discordGuestChannelMessageId && guestChannelId) {
        try {
          const { deleteChannelMessage } = await import('@/lib/discord-guild-api');
          await deleteChannelMessage(guestChannelId, raid.discordGuestChannelMessageId);
        } catch (e) {
          console.warn('[syncRaidGuestChannelSummary] delete failed:', e);
        }
        await prisma.rfRaid.update({
          where: { id: raidId },
          data: { discordGuestChannelMessageId: null },
        });
      }
      return;
    }

    const embeds = await buildGuestRaidDiscordEmbedsForRaid(raid);
    const components = buildGuestRaidActionButtons(raid.id, raid.guildId);

    if (raid.discordGuestChannelMessageId) {
      try {
        await editChannelMessageFull(
          guestChannelId!,
          raid.discordGuestChannelMessageId,
          opts?.embedOnly ? { embeds } : { embeds, components },
        );
        return;
      } catch (e) {
        console.warn('[syncRaidGuestChannelSummary] edit failed:', e);
        if (!opts?.allowCreate) return;
        await prisma.rfRaid.update({
          where: { id: raidId },
          data: { discordGuestChannelMessageId: null },
        });
      }
    }

    const { messageId } = await createChannelMessageFull(guestChannelId!, {
      embeds,
      components,
    });
    await prisma.rfRaid.update({
      where: { id: raidId },
      data: { discordGuestChannelMessageId: messageId },
    });
  } catch (e) {
    console.error('[syncRaidGuestChannelSummary]', raidId, e);
  }
}

// ---------------------------------------------------------------------------
// Kern-Sync
// ---------------------------------------------------------------------------

export type SyncRaidThreadSummaryOptions = {
  /**
   * Nur das Embed patchen — ohne `components` im PATCH, damit bestehende Buttons
   * (z. B. während Discord-Interaktion kurz deaktiviert) nicht von der API
   * zurückgesetzt werden.
   */
  embedOnly?: boolean;
  /** Erlaubt Neu-Erstellung der Discord-Nachricht, falls keine Message-ID vorhanden ist oder Edit fehlschlägt. */
  allowCreate?: boolean;
};

/**
 * Erstellt oder aktualisiert den Embed-Post im Discord-Channel.
 *
 * - Kein discordChannelId gesetzt → nichts tun
 * - Kein discordChannelMessageId → neue Nachricht + Thread erstellen
 * - Vorhandenes discordChannelMessageId → Nachricht patchen
 */
export async function syncRaidThreadSummary(
  raidId: string,
  opts?: SyncRaidThreadSummaryOptions,
): Promise<void> {
  try {
    const raid = await loadRaidForSync(raidId);
    if (!raid) return;

    if (!raid.discordChannelId) {
      await syncRaidGuestChannelSummary(raidId, opts);
      return;
    }

    /** Abgesagt oder abgeschlossen: Embed entfernen, keine erneute Synchronisation. */
    if (raid.status === 'cancelled' || raid.status === 'completed') {
      if (raid.discordChannelMessageId) {
        try {
          const { deleteChannelMessage } = await import('@/lib/discord-guild-api');
          await deleteChannelMessage(raid.discordChannelId, raid.discordChannelMessageId);
        } catch (e) {
          console.warn('[syncRaidThreadSummary] cancelled raid message delete failed:', e);
        }
        try {
          await prisma.rfRaid.update({
            where: { id: raidId },
            data: { discordChannelMessageId: null, discordThreadId: null },
          });
        } catch (e) {
          console.warn('[syncRaidThreadSummary] cancelled raid clear discord ids failed:', e);
        }
      }
      await syncRaidGuestChannelSummary(raidId, opts);
      return;
    }

    const dungeonNames: string[] = [];
    // Primärer Dungeon immer an erster Stelle
    dungeonNames.push(raid.dungeon.name);
    // Weitere Dungeons aus dungeonIds (falls multi-dungeon)
    if (Array.isArray(raid.dungeonIds) && raid.dungeonIds.length > 1) {
      const extraIds = (raid.dungeonIds as string[]).filter(id => id !== raid.dungeonId);
      if (extraIds.length > 0) {
        const extras = await prisma.rfDungeon.findMany({
          where: { id: { in: extraIds } },
          select: { name: true },
        });
        dungeonNames.push(...extras.map(d => d.name));
      }
    }

    const threadTitle = `${dungeonNames[0]} – ${raid.name}`.slice(0, 100);

    const embeds     = await buildRaidDiscordEmbedsForRaid(raid);
    const components = buildRaidActionButtons(raid.id, raid.guildId);

    // --- Nachricht bearbeiten ---
    if (raid.discordChannelMessageId) {
      try {
        await editChannelMessageFull(
          raid.discordChannelId,
          raid.discordChannelMessageId,
          opts?.embedOnly
            ? { embeds: embeds }
            : { embeds: embeds, components },
        );
        // Thread nachholen wenn er fehlt (z. B. Ersterstellung fehlgeschlagen)
        if (!raid.discordThreadId) {
          try {
            const result = await createThreadFromMessage(
              raid.discordChannelId,
              raid.discordChannelMessageId,
              threadTitle
            );
            await prisma.rfRaid.update({
              where: { id: raidId },
              data:  { discordThreadId: result.threadId },
            });
          } catch {
            // Thread existiert bereits oder Kanal unterstützt keine Threads – ignorieren
          }
        }
        await syncRaidGuestChannelSummary(raidId, opts);
        return;
      } catch (e) {
        console.warn('[syncRaidThreadSummary] edit failed:', e);
        if (!opts?.allowCreate) {
          return;
        }
        // Nachricht existiert nicht mehr → optional neu erstellen
        await prisma.rfRaid.update({
          where: { id: raidId },
          data:  { discordChannelMessageId: null, discordThreadId: null },
        });
      }
    }

    if (!opts?.allowCreate) {
      await syncRaidGuestChannelSummary(raidId, opts);
      return;
    }

    // --- Neue Nachricht + Thread erstellen ---
    const { messageId } = await createChannelMessageFull(raid.discordChannelId, {
      embeds:     embeds,
      components,
    });

    let threadId: string | null = null;
    try {
      const result = await createThreadFromMessage(raid.discordChannelId, messageId, threadTitle);
      threadId = result.threadId;
    } catch (e) {
      console.warn('[syncRaidThreadSummary] thread creation failed:', e);
    }

    await prisma.rfRaid.update({
      where: { id: raidId },
      data: {
        discordChannelMessageId: messageId,
        discordThreadId:         threadId,
      },
    });

    await syncRaidGuestChannelSummary(raidId, opts);
  } catch (e) {
    console.error('[syncRaidThreadSummary]', raidId, e);
  }
}

const DISCORD_MESSAGE_MAX = 2000;
const THREAD_ARCHIVE_HEADER = '📜 **Protokoll (übernommen)**\n\n';

function formatThreadArchiveTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Zeitstempel vor jeder Zeile — bereits archivierte Zeilen (mit `[…]`) bleiben unverändert. */
function formatArchivedThreadLine(msg: DiscordFetchedMessage): string {
  const text = msg.content.trim();
  if (!text) return '';
  if (/^\[\d{1,2}\.\d{1,2}\.\d{2,4}[,.]?\s*\d{1,2}:\d{2}\]/.test(text)) {
    return text;
  }
  const ts = formatThreadArchiveTimestamp(new Date(msg.timestamp));
  return `[${ts}] ${text}`;
}

/** Gruppiert Protokollzeilen in mehrere Discord-Nachrichten (max. 2000 Zeichen). */
function buildThreadArchiveChunks(messages: DiscordFetchedMessage[]): string[] {
  const lines = messages.map(formatArchivedThreadLine).filter(Boolean);
  if (lines.length === 0) return [];

  const chunks: string[] = [];
  let buffer = THREAD_ARCHIVE_HEADER;

  const flush = () => {
    const trimmed = buffer.trimEnd();
    if (trimmed && trimmed !== THREAD_ARCHIVE_HEADER.trim()) {
      chunks.push(trimmed.slice(0, DISCORD_MESSAGE_MAX));
    }
    buffer = '';
  };

  for (const rawLine of lines) {
    const line =
      rawLine.length > DISCORD_MESSAGE_MAX - 20
        ? `${rawLine.slice(0, DISCORD_MESSAGE_MAX - 23)}…`
        : rawLine;

    const needsSep = buffer.length > 0 && !buffer.endsWith('\n\n') && buffer !== THREAD_ARCHIVE_HEADER;
    const candidate = needsSep ? `${buffer}\n${line}` : `${buffer}${line}`;

    if (candidate.length > DISCORD_MESSAGE_MAX) {
      flush();
      buffer = line;
      if (buffer.length > DISCORD_MESSAGE_MAX) {
        chunks.push(buffer.slice(0, DISCORD_MESSAGE_MAX));
        buffer = '';
      }
    } else {
      buffer = candidate;
    }
  }

  flush();
  return chunks;
}

async function loadThreadArchiveChunks(threadId: string): Promise<string[]> {
  try {
    const messages = await fetchAllChannelMessages(threadId);
    return buildThreadArchiveChunks(messages);
  } catch (e) {
    console.warn('[pushRaidDiscordPost] thread archive read failed:', e);
    return [];
  }
}

async function postThreadArchiveChunks(threadId: string, chunks: string[]): Promise<void> {
  const { createChannelMessage } = await import('@/lib/discord-guild-api');
  for (const chunk of chunks) {
    const text = chunk.trim();
    if (!text) continue;
    await createChannelMessage(threadId, text.slice(0, DISCORD_MESSAGE_MAX));
  }
}

/**
 * Raid-Post erneut senden (Push): alte Kanal-Nachricht löschen, neu posten → wieder unten im Channel.
 * Protokoll-Nachrichten aus dem bisherigen Thread werden mit Zeitstempel in den neuen Thread übernommen.
 */
export async function pushRaidDiscordPost(raidId: string): Promise<void> {
  const raid = await prisma.rfRaid.findUnique({
    where: { id: raidId },
    select: {
      discordChannelId: true,
      discordChannelMessageId: true,
      discordThreadId: true,
      status: true,
    },
  });
  if (!raid?.discordChannelId || !raid.discordChannelMessageId) {
    throw new Error('NO_DISCORD_POST');
  }
  if (raid.status === 'cancelled' || raid.status === 'completed') {
    throw new Error('RAID_NOT_PUSHABLE');
  }

  const channelId = raid.discordChannelId;
  const oldMessageId = raid.discordChannelMessageId;
  const oldThreadId = raid.discordThreadId?.trim() || null;

  const archiveChunks = oldThreadId ? await loadThreadArchiveChunks(oldThreadId) : [];

  await prisma.rfRaid.update({
    where: { id: raidId },
    data: { discordChannelMessageId: null },
  });

  try {
    await deleteChannelMessage(channelId, oldMessageId);
  } catch (e) {
    console.warn('[pushRaidDiscordPost] delete failed:', e);
  }

  await syncRaidThreadSummary(raidId, { allowCreate: true });

  const after = await prisma.rfRaid.findUnique({
    where: { id: raidId },
    select: { discordThreadId: true },
  });
  const newThreadId = after?.discordThreadId?.trim();
  if (newThreadId && archiveChunks.length > 0) {
    try {
      await postThreadArchiveChunks(newThreadId, archiveChunks);
    } catch (e) {
      console.warn('[pushRaidDiscordPost] thread archive post failed:', e);
    }
  }
}

export function formatRaidLeaderInfoDate(date: Date): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const LEADER_INFO_SEP = '━━━━━━━━━━━━━━━━━━━━━━';

export type RaidLeaderChannelContentInput = {
  title?: string;
  discordUserLabel: string;
  raidName: string;
  dungeonName: string;
  termin: string;
  changeBlock?: string;
  userMessage: string;
  footerMention: string;
};

/** Baut den Discord-Text für den Raidleader-Kanal (max. 2000 Zeichen). */
export function buildRaidLeaderChannelContent(input: RaidLeaderChannelContentInput): string {
  const {
    title = '📨 **Info an Raidleader**',
    discordUserLabel,
    raidName,
    dungeonName,
    termin,
    changeBlock,
    userMessage,
    footerMention,
  } = input;

  const headerParts = [
    title,
    LEADER_INFO_SEP,
    `👤 **Von:** ${discordUserLabel}`,
    `⚔️ **Raid:** ${raidName}`,
    `🏰 **Dungeon:** ${dungeonName}`,
    `📅 **Termin:** ${termin}`,
  ];
  if (changeBlock?.trim()) {
    headerParts.push('', '📋 **Änderung:**', changeBlock.trim());
  }
  headerParts.push('', '💬 **Nachricht:**');
  const header = headerParts.join('\n');

  const footer = footerMention ? `\n\n${LEADER_INFO_SEP}\n${footerMention}` : '';
  const maxBody = Math.max(0, 2000 - header.length - footer.length - 8);

  let body = userMessage.replace(/```/g, '`\u200b``');
  if (body.length > maxBody) {
    body = `${body.slice(0, Math.max(0, maxBody - 1))}…`;
  }

  return `${header}\n\`\`\`\n${body}\n\`\`\`${footer}`.slice(0, 2000);
}

/** Freitext eines Users an den konfigurierten Raidleader-Kanal. */
export async function postRaidLeaderChannelInfo(
  raidId: string,
  discordUserLabel: string,
  message: string
): Promise<void> {
  const raid = await prisma.rfRaid.findUnique({
    where: { id: raidId },
    select: {
      name: true,
      scheduledAt: true,
      discordLeaderChannelId: true,
      dungeon: { select: { name: true } },
      guild: { select: { discordRoleRaidleaderId: true } },
    },
  });
  if (!raid?.discordLeaderChannelId?.trim()) {
    throw new Error('NO_LEADER_CHANNEL');
  }

  const trimmed = message.trim();
  if (!trimmed) {
    throw new Error('MESSAGE_EMPTY');
  }

  const termin = formatRaidLeaderInfoDate(raid.scheduledAt);
  const rlRoleId = raid.guild.discordRoleRaidleaderId?.trim();
  const mention = rlRoleId ? `<@&${rlRoleId}>` : '';

  const content = buildRaidLeaderChannelContent({
    discordUserLabel,
    raidName: raid.name,
    dungeonName: raid.dungeon.name,
    termin,
    userMessage: trimmed,
    footerMention: mention,
  });

  await createChannelMessageFull(raid.discordLeaderChannelId, {
    content,
    ...(rlRoleId
      ? { allowedMentions: { parse: [], roles: [rlRoleId] } }
      : {}),
  });
}

// ---------------------------------------------------------------------------
// Benachrichtigungen (werden als neue Thread-Nachrichten gepostet)
// ---------------------------------------------------------------------------

function discordRaiderRoleMention(roleId: string | null | undefined): string | null {
  const id = roleId?.trim();
  if (!id) return null;
  return `<@&${id}>`;
}

function formatRaidChannelNoticeDate(date: Date): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatRaidChannelNoticeDateTime(date: Date): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Freitext im Gast-Channel (ohne Raider-Mention), nur bei allowGuests. */
export async function postRaidGuestChannelNotice(
  raidId: string,
  messageBody: string
): Promise<void> {
  const raid = await prisma.rfRaid.findUnique({
    where: { id: raidId },
    select: {
      allowGuests: true,
      discordGuestChannelId: true,
      status: true,
    },
  });
  const channelId = raid?.discordGuestChannelId?.trim();
  if (!channelId || !raid?.allowGuests) return;
  if (raid.status === 'cancelled' || raid.status === 'completed') return;

  const body = messageBody.trim();
  if (!body) return;

  await createChannelMessageFull(channelId, {
    content: body.slice(0, 2000),
  });
}

function buildScheduleChangeNoticeBody(
  raid: {
    name: string;
    scheduledAt: Date;
    signupUntil: Date;
    dungeon: { name: string };
  },
  changes: { startChanged: boolean; signupChanged: boolean },
  locale: 'de' | 'en'
): string {
  if (locale === 'en') {
    const lines: string[] = [
      `There is a schedule change for raid **${raid.dungeon.name} / ${raid.name}**:`,
    ];
    if (changes.startChanged) {
      lines.push(`• 📅 New start: **${formatRaidChannelNoticeDateTime(raid.scheduledAt)}**`);
    }
    if (changes.signupChanged) {
      lines.push(
        `• ⏰ New sign-up deadline: **${formatRaidChannelNoticeDateTime(raid.signupUntil)}**`
      );
    }
    lines.push('Please review your sign-up.');
    return lines.join('\n');
  }

  const lines: string[] = [
    `es gibt eine Terminänderung für den Raid **${raid.dungeon.name} / ${raid.name}**:`,
  ];
  if (changes.startChanged) {
    lines.push(`• 📅 Neuer Start: **${formatRaidChannelNoticeDateTime(raid.scheduledAt)} Uhr**`);
  }
  if (changes.signupChanged) {
    lines.push(`• ⏰ Neue Anmeldefrist: **${formatRaidChannelNoticeDateTime(raid.signupUntil)} Uhr**`);
  }
  lines.push('Bitte prüft eure Anmeldung.');
  return lines.join('\n');
}

/** Raider-Rolle im Raid-Channel erwähnen (nicht im Thread-Log). */
export async function postRaidRaiderChannelMention(
  raidId: string,
  messageBody: string,
  opts?: { commaAfterMention?: boolean }
): Promise<void> {
  const raid = await prisma.rfRaid.findUnique({
    where: { id: raidId },
    select: {
      discordChannelId: true,
      guild: { select: { discordRoleRaiderId: true } },
    },
  });
  const channelId = raid?.discordChannelId?.trim();
  if (!channelId) {
    throw new Error('NO_DISCORD_CHANNEL');
  }

  const body = messageBody.trim();
  if (!body) {
    throw new Error('MESSAGE_EMPTY');
  }

  const roleMention = discordRaiderRoleMention(raid!.guild.discordRoleRaiderId);
  const content = (
    roleMention
      ? opts?.commaAfterMention
        ? `${roleMention}, ${body}`
        : `${roleMention} ${body}`
      : body
  ).slice(0, 2000);
  const raiderRoleId = raid!.guild.discordRoleRaiderId?.trim();

  const { createChannelMessageFull } = await import('@/lib/discord-guild-api');
  await createChannelMessageFull(channelId, {
    content,
    ...(raiderRoleId
      ? { allowedMentions: { parse: [], roles: [raiderRoleId] } }
      : {}),
  });
}

/**
 * Beim Anlegen eines offenen Raids: Hinweis im Channel (oberhalb des Raid-Posts),
 * nicht im Thread-Protokoll.
 */
export async function postRaidOpenChannelNotice(raidId: string): Promise<void> {
  try {
    const raid = await prisma.rfRaid.findUnique({
      where: { id: raidId },
      select: {
        discordChannelId: true,
        scheduledAt: true,
        status: true,
        guild: { select: { discordRoleRaiderId: true } },
      },
    });
    if (!raid?.discordChannelId?.trim() || raid.status !== 'open') return;

    const dateLabel = formatRaidChannelNoticeDate(raid.scheduledAt);
    await postRaidRaiderChannelMention(
      raidId,
      `für den ${dateLabel} steht ein neuer Anmelder zur Verfügung.`,
      { commaAfterMention: true }
    );
  } catch (e) {
    console.error('[postRaidOpenChannelNotice]', raidId, e);
  }
}

/**
 * Nach dem Bearbeiten eines Raids: Raider im Channel darauf hinweisen, dass sich
 * Startzeit/Datum und/oder Anmeldefrist geändert haben (analog zur Neuanlage-Mitteilung).
 * Wird nur aufgerufen, wenn die Anmeldungen NICHT zurückgesetzt wurden.
 */
export async function postRaidScheduleChangeChannelNotice(
  raidId: string,
  changes: { startChanged: boolean; signupChanged: boolean }
): Promise<void> {
  try {
    if (!changes.startChanged && !changes.signupChanged) return;

    const raid = await prisma.rfRaid.findUnique({
      where: { id: raidId },
      select: {
        name: true,
        status: true,
        scheduledAt: true,
        signupUntil: true,
        allowGuests: true,
        discordChannelId: true,
        discordGuestChannelId: true,
        dungeon: { select: { name: true } },
      },
    });
    if (!raid) return;
    if (raid.status === 'cancelled' || raid.status === 'completed') return;

    const memberBody = buildScheduleChangeNoticeBody(raid, changes, 'de');
    const guestBody = buildScheduleChangeNoticeBody(raid, changes, 'en');

    if (raid?.discordChannelId?.trim()) {
      await postRaidRaiderChannelMention(raidId, memberBody, { commaAfterMention: true });
    }

    if (raid?.allowGuests && raid.discordGuestChannelId?.trim()) {
      await postRaidGuestChannelNotice(raidId, guestBody);
      await syncRaidGuestChannelSummary(raidId, { allowCreate: true });
    }
  } catch (e) {
    console.error('[postRaidScheduleChangeChannelNotice]', raidId, e);
  }
}

// ---------------------------------------------------------------------------
// Signup-Änderungs-Protokoll
// ---------------------------------------------------------------------------

export type SignupChangeAction = 'signup' | 'unsignup' | 'unsignup_declined' | 'edit';

export interface SignupChangeDetails {
  characterName: string | null;
  signedSpec:    string | null;
  type:          string;
  punctuality?:  string;
}

const ROLE_DE: Record<'Tank' | 'Healer' | 'Melee' | 'Range', string> = {
  Tank: 'Tank',
  Healer: 'Heiler',
  Melee: 'Nahkampf',
  Range: 'Fernkampf',
};

/**
 * Postet eine kurze Protokoll-Nachricht in den Raid-Thread wenn sich ein Spieler
 * anmeldet, abmeldet oder seine Anmeldung bearbeitet.
 * Protokoll wird gepostet, solange der Raid nicht abgesagt ist und ein Thread existiert.
 *
 * Wenn die Teilnehmerliste noch nicht „öffentlich“ ist (wie im Embed: nur bei
 * `signupVisibility === public` oder Status angekündigt/gesetzt), werden **keine**
 * Charakter-Namen und keine Spec-Namen genannt — nur Rolle (Tank/…) bzw. Reserve/Unklar.
 */
export async function postSignupChangeThreadNotice(
  raidId:  string,
  action:  SignupChangeAction,
  details: SignupChangeDetails,
): Promise<void> {
  try {
    const raid = await prisma.rfRaid.findUnique({
      where:  { id: raidId },
      select: {
        discordThreadId: true,
        status: true,
        signupVisibility: true,
      },
    });
    if (!raid?.discordThreadId) return;
    if (raid.status === 'cancelled' || raid.status === 'completed') return;

    const { createChannelMessage } = await import('@/lib/discord-guild-api');

    /** Wie `buildRaidEmbeds`: Liste nur bei public oder nach Ankündigung/Lock sichtbar. */
    const listPublic =
      raid.signupVisibility === 'public' ||
      raid.status === 'announced' ||
      raid.status === 'locked';

    const charName = details.characterName || '?';
    const specText = details.signedSpec ? ` · ${details.signedSpec}` : '';
    const typeText = details.type === 'reserve'   ? ' *(Reserve)*'
                   : details.type === 'uncertain' ? ' *(Unklar)*'
                   : details.type === 'declined'  ? ' *(Nicht da)*'
                   : '';
    const puncText = details.punctuality === 'tight' ? ' ⏳ Wird knapp'
                   : details.punctuality === 'late'  ? ' 🕐 Kommt später'
                   : '';

    const roleKey = roleFromSpecDisplayName(details.signedSpec);
    const roleDe  = roleKey ? ROLE_DE[roleKey] : null;

    let content: string;
    if (listPublic) {
      if (action === 'signup' && details.type === 'declined') {
        content = `🚫 **${charName}** ist nicht da`;
      } else if (action === 'signup') {
        content = `✍️ **${charName}** hat sich angemeldet${specText}${typeText}${puncText}`;
      } else if (action === 'unsignup_declined') {
        content = `🚫 **${charName}** hat sich abgemeldet und ist nicht da`;
      } else if (action === 'unsignup') {
        content = `🚪 **${charName}** hat sich abgemeldet`;
      } else if (action === 'edit' && details.type === 'declined') {
        content = `🚫 **${charName}** ist nicht da`;
      } else {
        content = `✏️ **${charName}** hat die Anmeldung bearbeitet${specText}${typeText}${puncText}`;
      }
    } else {
      const who = roleDe
        ? `Ein **${roleDe}**`
        : details.type === 'reserve'
          ? 'Eine **Reserve**-Anmeldung'
          : details.type === 'uncertain'
            ? 'Eine **Unklar**-Anmeldung'
            : 'Jemand';
      /** Ohne Namen: Typ nur zusätzlich, wenn Rolle schon genannt (z. B. Tank + Reserve). */
      let anonTypeSuffix = '';
      if (roleDe) {
        if (details.type === 'reserve') anonTypeSuffix = ' *(Reserve)*';
        else if (details.type === 'uncertain') anonTypeSuffix = ' *(Unklar)*';
        else if (details.type === 'declined') anonTypeSuffix = ' *(Nicht da)*';
      } else if (details.type === 'declined') {
        anonTypeSuffix = ' *(Nicht da)*';
      }
      if (action === 'signup' && details.type === 'declined') {
        content = `🚫 ${who} ist nicht da`;
      } else if (action === 'signup') {
        content = `✍️ ${who} hat sich angemeldet${anonTypeSuffix}${puncText}`;
      } else if (action === 'unsignup_declined') {
        content = `🚫 ${who} hat sich abgemeldet und ist nicht da`;
      } else if (action === 'unsignup') {
        content = `🚪 ${who} hat sich abgemeldet`;
      } else if (action === 'edit' && details.type === 'declined') {
        content = `🚫 ${who} ist nicht da`;
      } else {
        content = `✏️ ${who} hat die Anmeldung bearbeitet${anonTypeSuffix}${puncText}`;
      }
    }

    await createChannelMessage(raid.discordThreadId, content.slice(0, 2000));
  } catch (e) {
    console.error('[postSignupChangeThreadNotice]', raidId, e);
  }
}

// ---------------------------------------------------------------------------
// Raid angekündigt — Thread-Hinweis mit Kader-Mentions
// ---------------------------------------------------------------------------

async function postRaidAnnounceThreadChunks(threadId: string, fullText: string): Promise<void> {
  const { createChannelMessage } = await import('@/lib/discord-guild-api');
  const max = 1990;
  let remaining = fullText.trim();
  if (!remaining) return;
  while (remaining.length > 0) {
    if (remaining.length <= max) {
      await createChannelMessage(threadId, remaining);
      break;
    }
    let cut = remaining.lastIndexOf(' ', max);
    if (cut < 120) cut = max;
    const part = remaining.slice(0, cut).trimEnd();
    await createChannelMessage(threadId, part);
    remaining = remaining.slice(cut).trimStart();
  }
}

/** Thread-Nachricht nach Veröffentlichung (Ankündigung): Kader mit Discord-Mentions. */
export async function postRaidAnnouncedThreadNotice(raidId: string): Promise<void> {
  try {
    const raid = await prisma.rfRaid.findUnique({
      where: { id: raidId },
      select: {
        discordThreadId: true,
        name: true,
        status: true,
        announcedPlannerGroupsJson: true,
        dungeon: { select: { name: true } },
      },
    });
    if (!raid?.discordThreadId) return;
    if (raid.status !== 'announced' && raid.status !== 'locked') return;

    const layout = parseStoredAnnouncedPlannerJson(raid.announcedPlannerGroupsJson);
    if (!layout) return;

    const rosterIds = layout.groups.flatMap((g) => g.rosterOrder);
    if (rosterIds.length === 0) return;

    const signups = await prisma.rfRaidSignup.findMany({
      where: { id: { in: rosterIds } },
      select: {
        id: true,
        user: { select: { discordId: true } },
        character: { select: { name: true } },
      },
    });
    const byId = new Map(signups.map((s) => [s.id, s]));
    const mentions: string[] = [];
    for (const id of rosterIds) {
      const s = byId.get(id);
      if (!s) continue;
      const charName = s.character?.name?.trim() || 'Spieler';
      const did = s.user?.discordId?.trim();
      if (did) mentions.push(`**${charName}** <@${did}>`);
      else mentions.push(`**${charName}**`);
    }
    if (mentions.length === 0) return;

    const intro =
      `📢 **Raid angekündigt** — ${raid.dungeon.name} / **${raid.name}**\n\n` +
      `Im Kader gesetzt (${mentions.length}):\n\n`;
    const body = mentions.join(' ');
    await postRaidAnnounceThreadChunks(raid.discordThreadId, intro + body);
  } catch (e) {
    console.error('[postRaidAnnouncedThreadNotice]', raidId, e);
  }
}

// ---------------------------------------------------------------------------
// Raid-gesetzt-Benachrichtigung
// ---------------------------------------------------------------------------

/** Zusätzliche Thread-Nachricht nach „Raid setzen" (Benachrichtigung). */
export async function postRaidLockedThreadNotice(raidId: string): Promise<void> {
  try {
    const raid = await prisma.rfRaid.findUnique({
      where: { id: raidId },
      include: { dungeon: { select: { name: true } } },
    });
    // Nachricht in den Diskussions-Thread oder – falls keiner vorhanden – in den Channel
    const targetId = raid?.discordThreadId ?? raid?.discordChannelId ?? null;
    if (!targetId) return;

    const { createChannelMessage } = await import('@/lib/discord-guild-api');
    const content =
      `🔒 **Raid gesetzt** — ${raid!.dungeon.name} / ${raid!.name}\n` +
      `Die Teilnehmerliste wurde festgelegt. Details in der RaidFlow-Webapp.`;
    await createChannelMessage(targetId, content.slice(0, 2000));
  } catch (e) {
    console.error('[postRaidLockedThreadNotice]', raidId, e);
  }
}
