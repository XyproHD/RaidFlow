import { getAllSpecDisplayNames } from '@/lib/wow-tbc-classes';

const DISPLAY_TO_ROLE = new Map<string, 'Tank' | 'Melee' | 'Range' | 'Healer'>();

for (const row of getAllSpecDisplayNames()) {
  DISPLAY_TO_ROLE.set(row.displayName, row.role);
}

/**
 * Mappt Charakter-main_spec (Anzeigename) auf Tank/Melee/Range/Healer.
 */
export function roleFromSpecDisplayName(
  spec: string | null | undefined
): 'Tank' | 'Melee' | 'Range' | 'Healer' | null {
  if (!spec?.trim()) return null;
  return DISPLAY_TO_ROLE.get(spec.trim()) ?? null;
}
