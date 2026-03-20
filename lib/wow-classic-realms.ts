export type WowRegion = 'eu' | 'us' | 'kr' | 'tw';

// User-facing WoW version presets for the profile auto-add UI.
// Internally, we still store some Battle.net "wow_version" variants in the DB
// (e.g. classic_era, anniversary, progression) and map these presets to them.
export type WowPreset = 'retail' | 'classic' | 'tbc' | 'mop';

export type WowRealm = {
  name: string;
  slug: string;
  region: WowRegion;
};

export const WOW_VERSION_OPTIONS: { id: WowPreset; label: string }[] = [
  { id: 'retail', label: 'WoW' },
  { id: 'classic', label: 'WoW Classic' },
  { id: 'tbc', label: 'Jubilaeum von Burning Crusade' },
  { id: 'mop', label: 'Mists of Pandaria Classic' },
];

// Maps UI preset -> internal values stored in rf_battlenet_realm.wow_version
export const WOW_PRESET_TO_INTERNAL_WOW_VERSIONS: Record<WowPreset, string[]> = {
  // The realm index table currently only contains Classic-family variants.
  retail: [],
  // "WoW Classic" = Era/Hardcore/SoD (NOT anniversary).
  classic: ['classic_era', 'hardcore', 'season_of_discovery'],
  // "Jubilaeum von Burning Crusade" currently maps to classic anniversary realms.
  tbc: ['anniversary'],
  // MoP Classic currently shares progression realm pool in our dataset.
  mop: ['progression'],
};

