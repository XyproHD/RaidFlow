import type { BattlenetProfileJson } from '@/lib/battlenet-character-persist';

/** Mindestlevel für neue Charaktere (nach erfolgreichem Battle.net-Sync). */
export const MIN_CHARACTER_LEVEL_FOR_NEW_CHARACTER = 55;

export function isBattlenetLevelEligibleForNewCharacter(level: number | null | undefined): boolean {
  return typeof level === 'number' && Number.isFinite(level) && level >= MIN_CHARACTER_LEVEL_FOR_NEW_CHARACTER;
}

export function assertBattlenetProfileForNewCharacter(
  bnet: BattlenetProfileJson | null
): { ok: true } | { ok: false; error: string } {
  if (!bnet) {
    return { ok: false, error: 'Battle.net-Profil fehlt. Bitte zuerst „BNet Sync“ ausführen.' };
  }
  if (!isBattlenetLevelEligibleForNewCharacter(bnet.level)) {
    return {
      ok: false,
      error: `Charakter muss mindestens Level ${MIN_CHARACTER_LEVEL_FOR_NEW_CHARACTER} sein (laut Battle.net).`,
    };
  }
  return { ok: true };
}
