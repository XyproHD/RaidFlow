import { prisma } from '@/lib/prisma';
import { buildRaidEmbeds, buildGuestRaidEmbeds } from '@/lib/raid-embed-builder';
import { getAppConfig } from '@/lib/app-config';
import type { DiscordEmbed } from '@/lib/discord-guild-api';

function getAppUrl(): string {
  return (
    process.env.NEXTAUTH_URL?.replace(/\/$/, '') ||
    'http://localhost:3000'
  );
}

async function loadRaidForDisplay(raidId: string) {
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

type LoadedRaidForDisplay = NonNullable<Awaited<ReturnType<typeof loadRaidForDisplay>>>;

export function fingerprintRaidDiscordEmbeds(embeds: DiscordEmbed[]): string {
  const norm = embeds.map((embed) => ({
    t: embed.title ?? '',
    d: embed.description ?? '',
    f: (embed.fields ?? []).map((field) => `${field.name}\u0001${field.value}`),
    ft: embed.footer?.text ?? '',
    c: embed.color ?? 0,
  }));
  return JSON.stringify(norm);
}

export async function buildRaidDiscordEmbedsForRaid(
  raid: LoadedRaidForDisplay,
  locale: 'de' | 'en' = 'de',
): Promise<DiscordEmbed[]> {
  const dungeonNames: string[] = [raid.dungeon.name];
  if (Array.isArray(raid.dungeonIds) && raid.dungeonIds.length > 1) {
    const extraIds = (raid.dungeonIds as string[]).filter((id) => id !== raid.dungeonId);
    if (extraIds.length > 0) {
      const extras = await prisma.rfDungeon.findMany({
        where: { id: { in: extraIds } },
        select: { name: true },
      });
      dungeonNames.push(...extras.map((d) => d.name));
    }
  }

  const appConfig = await getAppConfig().catch(() => null);
  const discordEmojis = appConfig?.discordEmojis ?? {};

  const payload = {
    raidId: raid.id,
    guildId: raid.guildId,
    raidName: raid.name,
    publicNote: raid.note,
    dungeonNames,
    scheduledAt: raid.scheduledAt,
    signupUntil: raid.signupUntil,
    status: raid.status,
    maxPlayers: raid.maxPlayers,
    minTanks: raid.minTanks,
    minMelee: raid.minMelee,
    minRange: raid.minRange,
    minHealers: raid.minHealers,
    signupVisibility: raid.signupVisibility,
    announcedGroupsJson: raid.announcedPlannerGroupsJson,
    discordEmojis,
    signups: raid.signups.map((s) => ({
      id: s.id,
      userId: s.userId,
      characterName: s.character?.name ?? null,
      mainSpec: s.character?.mainSpec ?? null,
      signedSpec: s.signedSpec,
      isMain: s.character?.isMain ?? null,
      leaderPlacement: s.leaderPlacement,
      setConfirmed: s.setConfirmed,
      isLate: s.isLate,
      punctuality: s.punctuality,
      type: s.type,
      originalSignupType: s.originalSignupType ?? s.type,
      isGuest: s.isGuest,
    })),
    appUrl: getAppUrl(),
    locale,
  };

  return locale === 'en' ? buildGuestRaidEmbeds(payload) : buildRaidEmbeds(payload);
}

export type RaidDiscordDisplaySnapshot = {
  channelId: string;
  messageId: string | null;
  embeds: DiscordEmbed[];
  fingerprint: string;
};

export async function getRaidDiscordDisplaySnapshot(
  raidId: string,
): Promise<RaidDiscordDisplaySnapshot | null> {
  const raid = await loadRaidForDisplay(raidId);
  if (!raid?.discordChannelId) return null;
  if (raid.status === 'cancelled' || raid.status === 'completed') return null;

  const embeds = await buildRaidDiscordEmbedsForRaid(raid);
  return {
    channelId: raid.discordChannelId,
    messageId: raid.discordChannelMessageId,
    embeds,
    fingerprint: fingerprintRaidDiscordEmbeds(embeds),
  };
}

export async function buildGuestRaidDiscordEmbedsForRaid(
  raid: LoadedRaidForDisplay,
): Promise<DiscordEmbed[]> {
  return buildRaidDiscordEmbedsForRaid(raid, 'en');
}
