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
  { id: 'retail', label: 'Retail' },
  { id: 'classic', label: 'Classic' },
  { id: 'tbc', label: 'TBC' },
  { id: 'mop', label: 'MoP' },
];

// Maps UI preset -> internal values stored in rf_battlenet_realm.wow_version
export const WOW_PRESET_TO_INTERNAL_WOW_VERSIONS: Record<WowPreset, string[]> = {
  // The realm index table currently only contains Classic-family variants.
  retail: [],
  classic: ['classic_era', 'hardcore', 'season_of_discovery', 'anniversary'],
  // In our seed data, "progression" is used for the TBC/Tier we care about.
  tbc: ['progression'],
  mop: [],
};

