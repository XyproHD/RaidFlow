/**
 * Realm `name` column is JSONB: { "de_DE": "…", "en_US": "…", … } (Battle.net locale keys).
 */

export function appLocaleToBnetLocale(appLocale: string): string {
  const base = (appLocale || 'en').split('-')[0].toLowerCase();
  const map: Record<string, string> = {
    de: 'de_DE',
    en: 'en_US',
    fr: 'fr_FR',
    es: 'es_ES',
    it: 'it_IT',
    pt: 'pt_BR',
  };
  return map[base] ?? 'en_US';
}

/** Battle.net dynamic namespace (realm search) → profile namespace (character profile). */
export function dynamicNamespaceToProfileNamespace(dynamicNs: string): string {
  return dynamicNs.replace(/^dynamic-/, 'profile-');
}

function firstNonEmptyString(obj: Record<string, unknown>): string {
  for (const v of Object.values(obj)) {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return '';
}

/**
 * Pick a display string from stored JSON `name` for UI, preferring the app locale → Battle.net locale.
 */
export function pickRealmNameFromJson(value: unknown, preferredBnetLocale: string): string {
  if (typeof value === 'string') return value.trim();

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '';
  }

  const names = value as Record<string, unknown>;
  const order = [
    preferredBnetLocale,
    'de_DE',
    'en_GB',
    'en_US',
    'fr_FR',
    'es_ES',
    'it_IT',
    'pt_BR',
  ];

  for (const loc of order) {
    const localized = names[loc];
    if (typeof localized === 'string' && localized.trim().length > 0) {
      return localized.trim();
    }
  }

  return firstNonEmptyString(names);
}

export function titleCaseFromSlug(slug: string): string {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
