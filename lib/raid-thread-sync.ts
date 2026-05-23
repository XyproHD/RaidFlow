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
import { buildRaidEmbeds, buildRaidActionButtons } from '@/lib/raid-embed-builder';
import { getAppConfig } from '@/lib/app-config';
import { roleFromSpecDisplayName } from '@/lib/spec-to-role';
import { parseStoredAnnouncedPlannerJson } from '@/lib/raid-announce';

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function getAppUrl(): string {
  // User-sichtbare Links in Discord-Embeds müssen auf die öffentliche Webapp-URL
  // (NEXTAUTH_URL) zeigen. WEBAPP_URL ist nur für Bot→Backend-Calls gedacht und
  // kann auf eine interne/Preview-URL zeigen.
  return (
    process.env.NEXTAUTH_URL?.replace(/\/$/, '') ||
    'http://localhost:3000'
  );
}

async function loadRaidForSync(raidId: string) {
  return prisma.rfRaid.findUnique({
    where: { id: raidId },
    include: {
      dungeon: { select: { name: true } },
      signups: {
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
    if (!raid?.discordChannelId) return;

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

    const appConfig = await getAppConfig().catch(() => null);
    const discordEmojis = appConfig?.discordEmojis ?? {};

    const draftPlannerReserveOrder =
      parseStoredAnnouncedPlannerJson(
        (raid as { draftPlannerGroupsJson?: unknown }).draftPlannerGroupsJson
      )?.reserveOrder ?? null;

    const embedInput = {
      raidId:             raid.id,
      guildId:            raid.guildId,
      raidName:           raid.name,
      publicNote:         raid.note,
      dungeonNames,
      scheduledAt:        raid.scheduledAt,
      signupUntil:        raid.signupUntil,
      status:             raid.status,
      maxPlayers:         raid.maxPlayers,
      minTanks:           raid.minTanks,
      minMelee:           raid.minMelee,
      minRange:           raid.minRange,
      minHealers:         raid.minHealers,
      signupVisibility:   raid.signupVisibility,
      announcedGroupsJson: raid.announcedPlannerGroupsJson,
      draftPlannerReserveOrder,
      discordEmojis,
      signups: raid.signups.map(s => ({
        id:              s.id,
        userId:          s.userId,
        characterName:   s.character?.name ?? null,
        mainSpec:        s.character?.mainSpec ?? null,
        signedSpec:      s.signedSpec,
        isMain:          s.character?.isMain ?? null,
        leaderPlacement: s.leaderPlacement,
        isLate:          s.isLate,
        punctuality:     s.punctuality,
        type:            s.type,
      })),
      appUrl: getAppUrl(),
      locale: 'de',
    };

    const embeds     = buildRaidEmbeds(embedInput);
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

function formatRaidLeaderInfoDate(date: Date): string {
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

/** Baut den Discord-Text für den Raidleader-Kanal (max. 2000 Zeichen). */
function buildRaidLeaderChannelContent(
  discordUserLabel: string,
  raidName: string,
  dungeonName: string,
  termin: string,
  userMessage: string,
  raidleaderMention: string
): string {
  const header = [
    '📨 **Info an Raidleader**',
    LEADER_INFO_SEP,
    `👤 **Von:** ${discordUserLabel}`,
    `⚔️ **Raid:** ${raidName}`,
    `🏰 **Dungeon:** ${dungeonName}`,
    `📅 **Termin:** ${termin}`,
    '',
    '💬 **Nachricht:**',
  ].join('\n');

  const footer = raidleaderMention ? `\n\n${LEADER_INFO_SEP}\n${raidleaderMention}` : '';
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

  const content = buildRaidLeaderChannelContent(
    discordUserLabel,
    raid.name,
    raid.dungeon.name,
    termin,
    trimmed,
    mention
  );

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

/** Thread-Log beim Anlegen eines offenen Raids: Raider-Rolle per @ informieren. */
export async function postRaidOpenThreadNotice(raidId: string): Promise<void> {
  try {
    const raid = await prisma.rfRaid.findUnique({
      where: { id: raidId },
      select: {
        discordThreadId: true,
        name: true,
        status: true,
        guild: { select: { discordRoleRaiderId: true } },
        dungeon: { select: { name: true } },
      },
    });
    if (!raid?.discordThreadId) return;
    if (raid.status !== 'open') return;

    const { createChannelMessageFull } = await import('@/lib/discord-guild-api');
    const roleMention = discordRaiderRoleMention(raid.guild.discordRoleRaiderId);
    const lead = roleMention
      ? `${roleMention}, ein neuer Raid steht zur Anmeldung bereit.`
      : 'Ein neuer Raid steht zur Anmeldung bereit.';
    const content = `${lead}\n📣 **${raid.dungeon.name}** / **${raid.name}**`;

    const raiderRoleId = raid.guild.discordRoleRaiderId?.trim();
    await createChannelMessageFull(raid.discordThreadId, {
      content: content.slice(0, 2000),
      ...(raiderRoleId
        ? { allowedMentions: { parse: [], roles: [raiderRoleId] } }
        : {}),
    });
  } catch (e) {
    console.error('[postRaidOpenThreadNotice]', raidId, e);
  }
}

// ---------------------------------------------------------------------------
// Signup-Änderungs-Protokoll
// ---------------------------------------------------------------------------

export type SignupChangeAction = 'signup' | 'unsignup' | 'edit';

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
