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
  editChannelMessageFull,
} from '@/lib/discord-guild-api';
import { buildRaidEmbed, buildRaidActionButtons } from '@/lib/raid-embed-builder';
import { getAppConfig } from '@/lib/app-config';

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function getAppUrl(): string {
  return (
    process.env.NEXTAUTH_URL?.replace(/\/$/, '') ||
    process.env.WEBAPP_URL?.replace(/\/$/, '') ||
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

    const embed      = buildRaidEmbed(embedInput);
    const components = [buildRaidActionButtons(raid.id, raid.guildId)];

    // --- Nachricht bearbeiten ---
    if (raid.discordChannelMessageId) {
      try {
        await editChannelMessageFull(
          raid.discordChannelId,
          raid.discordChannelMessageId,
          opts?.embedOnly
            ? { embeds: [embed] }
            : { embeds: [embed], components },
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
        console.warn('[syncRaidThreadSummary] edit failed, re-posting:', e);
        // Nachricht existiert nicht mehr → neue erstellen
        await prisma.rfRaid.update({
          where: { id: raidId },
          data:  { discordChannelMessageId: null, discordThreadId: null },
        });
      }
    }

    // --- Neue Nachricht + Thread erstellen ---
    const { messageId } = await createChannelMessageFull(raid.discordChannelId, {
      embeds:     [embed],
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

// ---------------------------------------------------------------------------
// Benachrichtigungen (werden als neue Thread-Nachrichten gepostet)
// ---------------------------------------------------------------------------

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

/**
 * Postet eine kurze Protokoll-Nachricht in den Raid-Thread wenn sich ein Spieler
 * anmeldet, abmeldet oder seine Anmeldung bearbeitet.
 * Protokoll wird gepostet, solange der Raid nicht abgesagt ist und ein Thread existiert
 * (unabhängig von signupVisibility — der Thread ist die Raid-Diskussion).
 */
export async function postSignupChangeThreadNotice(
  raidId:  string,
  action:  SignupChangeAction,
  details: SignupChangeDetails,
): Promise<void> {
  try {
    const raid = await prisma.rfRaid.findUnique({
      where:  { id: raidId },
      select: { discordThreadId: true, status: true },
    });
    if (!raid?.discordThreadId) return;
    if (raid.status === 'cancelled') return;

    const { createChannelMessage } = await import('@/lib/discord-guild-api');

    const charName = details.characterName || '?';
    const specText = details.signedSpec ? ` · ${details.signedSpec}` : '';
    const typeText = details.type === 'reserve'   ? ' *(Reserve)*'
                   : details.type === 'uncertain' ? ' *(Unsicher)*'
                   : '';
    const puncText = details.punctuality === 'tight' ? ' ⏳ Wird knapp'
                   : details.punctuality === 'late'  ? ' 🕐 Kommt später'
                   : '';

    let content: string;
    if (action === 'signup') {
      content = `✍️ **${charName}** hat sich angemeldet${specText}${typeText}${puncText}`;
    } else if (action === 'unsignup') {
      content = `🚪 **${charName}** hat sich abgemeldet`;
    } else {
      content = `✏️ **${charName}** hat die Anmeldung bearbeitet${specText}${typeText}${puncText}`;
    }

    await createChannelMessage(raid.discordThreadId, content.slice(0, 2000));
  } catch (e) {
    console.error('[postSignupChangeThreadNotice]', raidId, e);
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
