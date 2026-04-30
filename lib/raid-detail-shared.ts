/**
 * Reine Typen/Hilfen für Raid-Detail (ohne Prisma/Server-only).
 * Client-Komponenten nur hier importieren — nicht @/lib/raid-detail-access.
 */

export type RaidPageMode = 'view' | 'edit' | 'signup';

/** Nach Ablauf „Anmeldung bis“ nur noch Reserve; sonst volle Typen. */
export type RaidSignupPhase = 'full' | 'reserve_only' | 'closed';

/** Eigene Anmeldung(en) für Raid-Detail / Signup-Formular (ohne Prisma). */
export type RaidSignupSelfSnapshot = {
  id: string;
  characterId: string | null;
  type: string;
  isLate: boolean;
  punctuality: 'on_time' | 'tight' | 'late';
  note: string | null;
  signedSpec: string | null;
  onlySignedSpec: boolean;
  forbidReserve: boolean;
  leaderPlacement: string;
  setConfirmed: boolean;
};

export function computeRaidSignupPhase(raid: {
  status: string;
  signupUntil: Date;
}): RaidSignupPhase {
  if (raid.status === 'announced') return 'reserve_only';
  if (raid.status !== 'open') return 'closed';
  if (Date.now() <= raid.signupUntil.getTime()) return 'full';
  return 'reserve_only';
}

/**
 * Query-Parameter `mode` oder `modus` (deutsche Aliase).
 * Standard: Anzeigen (view), wenn kein oder unbekannter Wert.
 */
export function parseRaidPageMode(searchParams: {
  mode?: string;
  modus?: string;
}): RaidPageMode {
  const raw = (searchParams.mode ?? searchParams.modus ?? 'view').toLowerCase().trim();
  if (raw === '' || raw === 'view' || raw === 'anzeigen') return 'view';
  if (raw === 'edit' || raw === 'bearbeiten') return 'edit';
  if (raw === 'signup' || raw === 'anmelden') return 'signup';
  return 'view';
}

/** Anmeldeliste je nach signup_visibility und Rolle. Nach „Raid setzen“ (locked) ist die Liste bei raid_leader_only für alle sichtbar. */
export function filterSignupsVisibleToViewer<T extends { userId: string }>(
  signups: T[],
  viewerUserId: string,
  signupVisibility: string,
  canEdit: boolean,
  raidStatus?: string
): T[] {
  if (signupVisibility === 'public' || canEdit) {
    return signups;
  }
  if (raidStatus === 'locked' || raidStatus === 'announced') {
    return signups;
  }
  return signups.filter((s) => s.userId === viewerUserId);
}
