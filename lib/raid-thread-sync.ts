import { prisma } from '@/lib/prisma';
import {
  createChannelMessage,
  editChannelMessage,
} from '@/lib/discord-guild-api';
import { formatCompositionGaps } from '@/lib/raid-composition-summary';

const DEFAULT_LOCALE = 'de';

function appBaseUrl(): string {
  const u = process.env.NEXTAUTH_URL?.trim();
  return u && u.length > 0 ? u.replace(/\/$/, '') : 'https://raidflow.local';
}

/**
 * Baut die minimalistische Thread-Zusammenfassung (Discord, max. ~2000 Zeichen).
 */
export function buildRaidThreadSummaryContent(args: {
  dungeonName: string;
  raidName: string;
  signupCount: number;
  maxPlayers: number;
  gapsLine: string;
  guildId: string;
  raidId: string;
}): string {
  const base = appBaseUrl();
  const viewUrl = `${base}/${DEFAULT_LOCALE}/guild/${args.guildId}/raid/${args.raidId}`;
  const signupUrl = `${base}/${DEFAULT_LOCALE}/guild/${args.guildId}/raid/${args.raidId}?mode=signup`;

  const lines = [
    `**${args.dungeonName}** — ${args.raidName}`,
    `Anmeldungen: **${args.signupCount}** / ${args.maxPlayers}`,
    `Offen (Mindestbesetzung): ${args.gapsLine}`,
    '',
    '**Mein Status:** Im RaidFlow-Browser unter „Raid-Teilnahme“ siehst du deine Anmeldung.',
    `Raid: ${viewUrl}`,
    `Teilnahme / Anmeldung: ${signupUrl}`,
  ];
  return lines.join('\n').slice(0, 2000);
}

/**
 * Lädt Raid, aktualisiert oder erstellt die Zusammenfassungsnachricht im Discord-Thread.
 * Fehler werden geloggt, nicht geworfen (Fire-and-forget aus API-Routen).
 */
export async function syncRaidThreadSummary(raidId: string): Promise<void> {
  try {
    const raid = await prisma.rfRaid.findUnique({
      where: { id: raidId },
      include: {
        dungeon: { select: { name: true } },
        signups: {
          include: {
            character: { select: { name: true, mainSpec: true } },
          },
          orderBy: { signedAt: 'asc' },
        },
        _count: { select: { signups: true } },
      },
    });

    if (!raid?.discordThreadId) return;

    const gapsLine = formatCompositionGaps({
      minTanks: raid.minTanks,
      minMelee: raid.minMelee,
      minRange: raid.minRange,
      minHealers: raid.minHealers,
      minSpecs: raid.minSpecs as Record<string, number> | null,
      signups: raid.signups.map((s) => ({
        type: s.type,
        character: s.character ? { mainSpec: s.character.mainSpec } : null,
      })),
    });

    const baseContent = buildRaidThreadSummaryContent({
      dungeonName: raid.dungeon.name,
      raidName: raid.name,
      signupCount: raid._count.signups,
      maxPlayers: raid.maxPlayers,
      gapsLine,
      guildId: raid.guildId,
      raidId: raid.id,
    });

    const listLines = raid.signups.map((s) => {
      const late = s.isLate ? '⏱ ' : '';
      const nm = s.character?.name ?? '?';
      return `${late}${nm} — ${s.type}`;
    });

    const content = (
      listLines.length > 0
        ? `${baseContent}\n\n**Angemeldet:**\n${listLines.join('\n')}`
        : baseContent
    ).slice(0, 2000);

    const threadId = raid.discordThreadId;
    const msgId = raid.discordThreadSummaryMessageId;

    if (msgId) {
      try {
        await editChannelMessage(threadId, msgId, content);
        return;
      } catch (e) {
        console.warn('[syncRaidThreadSummary] edit failed, will try new message:', e);
      }
    }

    const { messageId } = await createChannelMessage(threadId, content);
    await prisma.rfRaid.update({
      where: { id: raidId },
      data: { discordThreadSummaryMessageId: messageId },
    });
  } catch (e) {
    console.error('[syncRaidThreadSummary]', raidId, e);
  }
}
