import { prisma } from '@/lib/prisma';
import type { RaidSignupPhase } from '@/lib/raid-detail-shared';
import type { RaidSignupPunctuality, RaidSignupType } from '@/lib/raid-signup-constants';
import { logRaidSignupAudit, snapshotSignup } from '@/lib/raid-signup-audit';
import { syncRaidThreadSummary } from '@/lib/raid-thread-sync';

const NOTE_MIN = 3;

function fireSync(raidId: string) {
  void syncRaidThreadSummary(raidId);
}

export function validateSignedSpecForCharacter(
  signedSpec: string,
  mainSpec: string,
  offSpec: string | null
): boolean {
  const s = signedSpec.trim();
  if (s === mainSpec.trim()) return true;
  if (offSpec && s === offSpec.trim()) return true;
  return false;
}

export function validateRaidSignupBusinessRules(args: {
  phase: RaidSignupPhase;
  typeNorm: RaidSignupType;
  forbidReserve: boolean;
  punctuality: RaidSignupPunctuality;
  note: string;
  signedSpecRaw: string;
  characterMainSpec: string;
  characterOffSpec: string | null;
}): { ok: true } | { ok: false; status: number; error: string } {
  const { phase, typeNorm, forbidReserve, punctuality, note, signedSpecRaw, characterMainSpec, characterOffSpec } =
    args;
  const isLate = punctuality === 'late';

  if (phase === 'reserve_only' && typeNorm !== 'reserve') {
    return {
      ok: false,
      status: 400,
      error: 'After signup deadline only reserve is allowed',
    };
  }
  if (forbidReserve && typeNorm === 'reserve') {
    return {
      ok: false,
      status: 400,
      error: 'Reserve is forbidden by signup condition',
    };
  }
  if (isLate && note.trim().length < NOTE_MIN) {
    return {
      ok: false,
      status: 400,
      error: 'Late attendance requires a note (e.g. approximate delay)',
    };
  }
  if (!validateSignedSpecForCharacter(signedSpecRaw, characterMainSpec, characterOffSpec)) {
    return {
      ok: false,
      status: 400,
      error: 'signedSpec must match main or off spec of the character',
    };
  }
  return { ok: true };
}

export type RaidSelfSignupMutationInput = {
  raidId: string;
  guildId: string;
  userId: string;
  changedByUserId: string;
  characterId: string;
  typeNorm: RaidSignupType;
  signedSpecRaw: string;
  onlySignedSpec: boolean;
  forbidReserve: boolean;
  punctuality: RaidSignupPunctuality;
  /** Leerstring wird als `null` gespeichert */
  note: string;
};

export async function commitRaidSelfSignupMutation(
  input: RaidSelfSignupMutationInput
): Promise<{ signup: Record<string, unknown>; isCreate: boolean }> {
  const {
    raidId,
    guildId,
    userId,
    changedByUserId,
    characterId,
    typeNorm,
    signedSpecRaw,
    onlySignedSpec,
    forbidReserve,
    punctuality,
    note,
  } = input;
  const isLate = punctuality === 'late';
  const data = {
    characterId,
    type: typeNorm,
    signedSpec: signedSpecRaw,
    onlySignedSpec,
    forbidReserve,
    isLate,
    punctuality,
    note: note.trim().length > 0 ? note.trim() : null,
  };

  const existing = await prisma.rfRaidSignup.findFirst({
    where: { raidId, userId },
  });

  if (existing) {
    const prevSnap = snapshotSignup({ ...existing });
    const updated = await prisma.rfRaidSignup.update({
      where: { id: existing.id },
      data: {
        ...data,
        allowReserve: false,
        leaderAllowsReserve: forbidReserve ? false : existing.leaderAllowsReserve,
      },
      select: {
        id: true,
        type: true,
        characterId: true,
        signedSpec: true,
        onlySignedSpec: true,
        forbidReserve: true,
        isLate: true,
        punctuality: true,
        note: true,
        allowReserve: true,
        leaderAllowsReserve: true,
        leaderMarkedTeilnehmer: true,
        signedAt: true,
      },
    });
    await logRaidSignupAudit({
      signupId: updated.id,
      raidId,
      guildId,
      changedByUserId,
      action: 'signup_update',
      oldValue: prevSnap,
      newValue: snapshotSignup(updated),
    });
    fireSync(raidId);
    return { signup: updated as unknown as Record<string, unknown>, isCreate: false };
  }

  const created = await prisma.rfRaidSignup.create({
    data: {
      raidId,
      userId,
      ...data,
      allowReserve: false,
      leaderAllowsReserve: !forbidReserve,
      leaderMarkedTeilnehmer: false,
    },
    select: {
      id: true,
      type: true,
      characterId: true,
      signedSpec: true,
      onlySignedSpec: true,
      forbidReserve: true,
      isLate: true,
      punctuality: true,
      note: true,
      allowReserve: true,
      leaderAllowsReserve: true,
      leaderMarkedTeilnehmer: true,
      signedAt: true,
    },
  });
  await logRaidSignupAudit({
    signupId: created.id,
    raidId,
    guildId,
    changedByUserId,
    action: 'signup_create',
    newValue: snapshotSignup(created),
  });
  fireSync(raidId);
  return { signup: created as unknown as Record<string, unknown>, isCreate: true };
}
