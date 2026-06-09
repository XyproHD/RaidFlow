/**
 * Spieler-Anmeldungen sperren ab 30 Minuten nach Raidtermin.
 * Raidleader: Planer + Abschließen bleiben möglich (eigene Auth).
 */

export const RAID_PLAYER_SIGNUP_LOCK_MS_AFTER_START = 30 * 60 * 1000;

export type RaidSignupLockInput = {
  status: string;
  scheduledAt: Date;
};

/** true = Spieler dürfen keine An-/Abmeldung oder Bearbeitung mehr vornehmen. */
export function isRaidPlayerSignupLocked(raid: RaidSignupLockInput): boolean {
  if (raid.status === 'cancelled' || raid.status === 'completed') {
    return true;
  }
  const lockAt = raid.scheduledAt.getTime() + RAID_PLAYER_SIGNUP_LOCK_MS_AFTER_START;
  return Date.now() > lockAt;
}
