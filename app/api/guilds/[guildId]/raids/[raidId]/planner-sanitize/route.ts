import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRaidPlannerOrForbid } from '@/lib/raid-planner-auth';
import {
  parseStoredAnnouncedPlannerJson,
  announceLayoutToStoredJson,
} from '@/lib/raid-announce';
import {
  sanitizeAnnounceRaidPayload,
  type PlannerSanitizeRemoval,
} from '@/lib/planner-roster-sanitize';
import { sanitizeRaidPlannerStorageAgainstSignups } from '@/lib/raid-planner-json-cleanup';
import { isPlannableRaidSignup } from '@/lib/raid-signup-constants';

/**
 * POST /api/guilds/[guildId]/raids/[raidId]/planner-sanitize
 * Prüft Draft- und Ankündigungs-Layout gegen aktuelle Signups; entfernt ungültige IDs.
 * Body: { persist?: boolean, layout?: AnnounceRaidPayload } — optional nur Client-Layout prüfen.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string; raidId: string }> }
) {
  const { guildId, raidId } = await params;
  const auth = await requireRaidPlannerOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  const raid = await prisma.rfRaid.findFirst({
    where: { id: raidId, guildId },
    select: {
      id: true,
      maxPlayers: true,
      status: true,
      draftPlannerGroupsJson: true,
      announcedPlannerGroupsJson: true,
    },
  });
  if (!raid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    const raw = await request.text();
    if (raw.trim()) body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const persist = body.persist === true;
  const signupRows = await prisma.rfRaidSignup.findMany({
    where: { raidId },
    select: { id: true, characterId: true, type: true, originalSignupType: true },
  });
  const known = new Set(signupRows.map((s) => s.id));
  const plannable = new Set(signupRows.filter(isPlannableRaidSignup).map((s) => s.id));
  const characterBySignupId = new Map(
    signupRows.map((s) => [s.id, s.characterId] as const)
  );

  const removed: PlannerSanitizeRemoval[] = [];
  const layoutsChecked: string[] = [];

  const clientLayout = body.layout;
  if (clientLayout && typeof clientLayout === 'object' && !Array.isArray(clientLayout)) {
    const parsed = parseStoredAnnouncedPlannerJson(clientLayout);
    if (parsed) {
      layoutsChecked.push('client');
      const s = sanitizeAnnounceRaidPayload(parsed, known, raid.maxPlayers, plannable);
      removed.push(...s.removed);
      if (persist && s.hadInvalid) {
        if (raid.status === 'open') {
          await prisma.rfRaid.update({
            where: { id: raidId },
            data: {
              draftPlannerGroupsJson: announceLayoutToStoredJson(s.payload, raid.maxPlayers),
            },
          });
        } else if (raid.status === 'announced') {
          await prisma.rfRaid.update({
            where: { id: raidId },
            data: {
              announcedPlannerGroupsJson: announceLayoutToStoredJson(s.payload, raid.maxPlayers),
            },
          });
        }
      }
      return NextResponse.json({
        ok: true,
        hadInvalid: s.hadInvalid,
        removed: enrichRemovals(removed, characterBySignupId),
        payload: s.payload,
        layoutsChecked,
        persisted: persist && s.hadInvalid,
      });
    }
  }

  if (persist) {
    const stored = await sanitizeRaidPlannerStorageAgainstSignups(prisma, raidId);
    if (stored?.hadInvalid) {
      return NextResponse.json({
        ok: true,
        hadInvalid: true,
        removed: enrichRemovals(stored.removed, characterBySignupId),
        layoutsChecked: ['draft', 'announced'],
        persisted: true,
      });
    }
  }

  for (const [key, raw] of [
    ['draft', raid.draftPlannerGroupsJson],
    ['announced', raid.announcedPlannerGroupsJson],
  ] as const) {
    const parsed = parseStoredAnnouncedPlannerJson(raw);
    if (!parsed) continue;
    layoutsChecked.push(key);
    const s = sanitizeAnnounceRaidPayload(parsed, known, raid.maxPlayers, plannable);
    removed.push(...s.removed);
  }

  const hadInvalid = removed.length > 0;
  if (persist && hadInvalid) {
    await sanitizeRaidPlannerStorageAgainstSignups(prisma, raidId);
  }

  return NextResponse.json({
    ok: true,
    hadInvalid,
    removed: enrichRemovals(removed, characterBySignupId),
    layoutsChecked,
    persisted: persist && hadInvalid,
  });
}

function enrichRemovals(
  removed: PlannerSanitizeRemoval[],
  characterBySignupId: Map<string, string | null>
): Array<
  PlannerSanitizeRemoval & {
    characterId: string | null;
    hint: string;
  }
> {
  return removed.map((r) => {
    const characterId = characterBySignupId.get(r.signupId) ?? null;
    const where =
      r.location === 'partySlot'
        ? `Gruppe ${(r.groupIndex ?? 0) + 1}, 5er ${(r.partyIndex ?? 0) + 1}, Slot ${(r.cellIndex ?? 0) + 1}`
        : r.location === 'roster'
          ? `Kader Gruppe ${(r.groupIndex ?? 0) + 1}`
          : r.location === 'reserve'
            ? 'Reserve'
            : 'Absagen';
    return {
      ...r,
      characterId,
      hint: `Signup-ID ${r.signupId} (${where}) — Anmeldung existiert nicht mehr`,
    };
  });
}
