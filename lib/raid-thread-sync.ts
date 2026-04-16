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

/**
 * Erstellt oder aktualisiert den Embed-Post im Discord-Channel.
 *
 * - Kein discordChannelId gesetzt → nichts tun
 * - Kein discordChannelMessageId → neue Nachricht + Thread erstellen
 * - Vorhandenes discordChannelMessageId → Nachricht patchen
 */
export async function syncRaidThreadSummary(raidId: string): Promise<void> {
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

    const embedInput = {
      raidId:             raid.id,
      guildId:            raid.guildId,
      raidName:           raid.name,
      dungeonNames,
      scheduledAt:        raid.scheduledAt,
      signupUntil:        raid.signupUntil,
      status:             raid.status,
      maxPlayers:         raid.maxPlayers,
      signupVisibility:   raid.signupVisibility,
      announcedGroupsJson: raid.announcedPlannerGroupsJson,
      signups: raid.signups.map(s => ({
        userId:          s.userId,
        characterName:   s.character?.name ?? null,
        mainSpec:        s.character?.mainSpec ?? null,
        signedSpec:      s.signedSpec,
        isMain:          s.character?.isMain ?? null,
        leaderPlacement: s.leaderPlacement,
        isLate:          s.isLate,
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
        await editChannelMessageFull(raid.discordChannelId, raid.discordChannelMessageId, {
          embeds:     [embed],
          components,
        });
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

    const threadTitle = `${dungeonNames[0]} – ${raid.name}`.slice(0, 100);
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
