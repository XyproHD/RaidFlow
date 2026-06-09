import { prisma } from '@/lib/prisma';
import { createChannelMessageFull } from '@/lib/discord-guild-api';
import {
  buildRaidLeaderChannelContent,
  formatRaidLeaderInfoDate,
} from '@/lib/raid-thread-sync';
import { signupTypeNorm } from '@/lib/raid-signup-constants';

export const ANNOUNCED_SET_PLAYER_COMMENT_MIN = 10;

export type SetPlayerSignupSnap = {
  type: string;
  signedSpec: string | null;
  punctuality?: string | null;
  note?: string | null;
  onlySignedSpec?: boolean;
  forbidReserve?: boolean;
  setConfirmed: boolean;
};

export function requiresAnnouncedSetPlayerComment(
  kind: 'unsignup' | 'edit',
  nextType: string | null
): boolean {
  if (kind === 'unsignup') return true;
  const t = nextType ? signupTypeNorm(nextType) : '';
  return t === 'declined' || t === 'reserve';
}

export function validateAnnouncedSetPlayerComment(
  comment: string,
  required: boolean
): { ok: true } | { ok: false; status: number; error: string } {
  if (!required) return { ok: true };
  if (comment.trim().length < ANNOUNCED_SET_PLAYER_COMMENT_MIN) {
    return {
      ok: false,
      status: 400,
      error: `comment required (min ${ANNOUNCED_SET_PLAYER_COMMENT_MIN} characters) for this change on an announced raid`,
    };
  }
  return { ok: true };
}

function formatSignupTypeDe(type: string): string {
  const t = signupTypeNorm(type);
  switch (t) {
    case 'normal':
      return 'Normal';
    case 'uncertain':
      return 'Unklar';
    case 'reserve':
      return 'Reserve';
    case 'declined':
      return 'Nicht da';
    default:
      return type;
  }
}

function formatPunctualityDe(punctuality: string | null | undefined): string {
  switch (punctuality) {
    case 'tight':
      return 'Wird knapp';
    case 'late':
      return 'Kommt später';
    case 'on_time':
    default:
      return 'Pünktlich';
  }
}

function formatBoolDe(v: boolean | undefined): string {
  return v ? 'Ja' : 'Nein';
}

/** Zeilen für den Block „Änderung“ (alt → neu). */
export function buildSetPlayerChangeSummaryLines(
  kind: 'unsignup' | 'edit',
  characterName: string,
  prev: SetPlayerSignupSnap,
  next: SetPlayerSignupSnap | null
): string[] {
  const lines: string[] = [`**Spieler:** ${characterName}`];

  if (kind === 'unsignup' || !next) {
    lines.push(`**Aktion:** Abmeldung`);
    lines.push(`**Zuletzt:** ${formatSignupTypeDe(prev.type)} · ${prev.signedSpec ?? '?'}`);
    lines.push(`**Pünktlichkeit:** ${formatPunctualityDe(prev.punctuality)}`);
    return lines;
  }

  lines.push(`**Aktion:** Anmeldung bearbeitet`);

  const prevType = signupTypeNorm(prev.type);
  const nextType = signupTypeNorm(next.type);
  if (prevType !== nextType) {
    lines.push(`**Status:** ${formatSignupTypeDe(prev.type)} → ${formatSignupTypeDe(next.type)}`);
  }

  const prevSpec = (prev.signedSpec ?? '').trim();
  const nextSpec = (next.signedSpec ?? '').trim();
  if (prevSpec !== nextSpec) {
    lines.push(`**Spec:** ${prevSpec || '—'} → ${nextSpec || '—'}`);
  }

  const prevP = prev.punctuality ?? 'on_time';
  const nextP = next.punctuality ?? 'on_time';
  if (prevP !== nextP) {
    lines.push(
      `**Pünktlichkeit:** ${formatPunctualityDe(prevP)} → ${formatPunctualityDe(nextP)}`
    );
  }

  if (Boolean(prev.onlySignedSpec) !== Boolean(next.onlySignedSpec)) {
    lines.push(
      `**Nur angemeldete Spec:** ${formatBoolDe(prev.onlySignedSpec)} → ${formatBoolDe(next.onlySignedSpec)}`
    );
  }

  if (Boolean(prev.forbidReserve) !== Boolean(next.forbidReserve)) {
    lines.push(
      `**Keine Reserve:** ${formatBoolDe(prev.forbidReserve)} → ${formatBoolDe(next.forbidReserve)}`
    );
  }

  if (lines.length === 2) {
    lines.push('**Details:** (keine Feldänderung erkannt)');
  }

  return lines;
}

export async function resolveRaidflowActorLabel(
  userId: string,
  guildId: string
): Promise<string> {
  const withDiscord = await prisma.rfCharacter.findFirst({
    where: { userId, guildId, guildDiscordDisplayName: { not: null } },
    select: { guildDiscordDisplayName: true, name: true, isMain: true },
    orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
  });
  const discord = withDiscord?.guildDiscordDisplayName?.trim();
  if (discord) return discord;

  const ch = await prisma.rfCharacter.findFirst({
    where: { userId, guildId },
    select: { name: true },
    orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
  });
  return ch?.name?.trim() || 'RaidFlow-Spieler';
}

export function snapFromSignupRow(row: {
  type: string;
  signedSpec: string | null;
  punctuality?: string | null;
  note?: string | null;
  onlySignedSpec?: boolean;
  forbidReserve?: boolean;
  setConfirmed: boolean;
}): SetPlayerSignupSnap {
  return {
    type: row.type,
    signedSpec: row.signedSpec,
    punctuality: row.punctuality ?? 'on_time',
    note: row.note,
    onlySignedSpec: row.onlySignedSpec,
    forbidReserve: row.forbidReserve,
    setConfirmed: row.setConfirmed,
  };
}

export function snapFromMutationResult(signup: Record<string, unknown>): SetPlayerSignupSnap {
  return {
    type: String(signup.type ?? 'normal'),
    signedSpec:
      typeof signup.signedSpec === 'string' ? signup.signedSpec : null,
    punctuality:
      typeof signup.punctuality === 'string' ? signup.punctuality : 'on_time',
    note: typeof signup.note === 'string' ? signup.note : null,
    onlySignedSpec: signup.onlySignedSpec === true,
    forbidReserve: signup.forbidReserve === true,
    setConfirmed: signup.setConfirmed === true,
  };
}

/**
 * Raidleader-Kanal: Warnung bei Änderung/Abmeldung eines gesetzten Spielers (Status „angekündigt“).
 */
export async function notifyAnnouncedSetPlayerChange(args: {
  raidId: string;
  actorLabel: string;
  kind: 'unsignup' | 'edit';
  characterName: string;
  previous: SetPlayerSignupSnap;
  next?: SetPlayerSignupSnap | null;
  comment: string;
}): Promise<void> {
  const raid = await prisma.rfRaid.findUnique({
    where: { id: args.raidId },
    select: {
      name: true,
      status: true,
      scheduledAt: true,
      discordLeaderChannelId: true,
      dungeon: { select: { name: true } },
      guild: { select: { discordRoleRaidleaderId: true } },
    },
  });
  if (!raid || raid.status !== 'announced') return;
  if (!args.previous.setConfirmed) return;
  const channelId = raid.discordLeaderChannelId?.trim();
  if (!channelId) return;

  const changeLines = buildSetPlayerChangeSummaryLines(
    args.kind,
    args.characterName,
    args.previous,
    args.next ?? null
  );
  const changeBlock = changeLines.join('\n');
  const commentBody = args.comment.trim() || '—';

  const termin = formatRaidLeaderInfoDate(raid.scheduledAt);
  const rlRoleId = raid.guild.discordRoleRaidleaderId?.trim();
  const mention = rlRoleId ? `<@&${rlRoleId}>` : '';

  const content = buildRaidLeaderChannelContent({
    title: '⚠️ **Warnung — Änderung am gesetzten Kader**',
    discordUserLabel: args.actorLabel,
    raidName: raid.name,
    dungeonName: raid.dungeon.name,
    termin,
    changeBlock,
    userMessage: commentBody,
    footerMention: mention,
  });

  await createChannelMessageFull(channelId, {
    content,
    ...(rlRoleId ? { allowedMentions: { parse: [], roles: [rlRoleId] } } : {}),
  });
}

/** Nach erfolgreicher Mutation: optional Leader-Warnung (Fehler nur loggen). */
export async function tryNotifyAnnouncedSetPlayerChange(args: {
  raidId: string;
  guildId: string;
  userId: string;
  actorLabel?: string;
  kind: 'unsignup' | 'edit';
  characterName: string;
  previous: SetPlayerSignupSnap | null;
  next?: SetPlayerSignupSnap | null;
  comment: string;
}): Promise<void> {
  if (!args.previous?.setConfirmed) return;
  try {
    const actorLabel =
      args.actorLabel?.trim() ||
      (await resolveRaidflowActorLabel(args.userId, args.guildId));
    await notifyAnnouncedSetPlayerChange({
      raidId: args.raidId,
      actorLabel,
      kind: args.kind,
      characterName: args.characterName,
      previous: args.previous,
      next: args.next ?? null,
      comment: args.comment,
    });
  } catch (e) {
    console.error('[tryNotifyAnnouncedSetPlayerChange]', args.raidId, e);
  }
}
