export type WowRegion = 'eu' | 'us' | 'kr' | 'tw';
export type WowVersion =
  | 'progression'
  | 'classic_era'
  | 'hardcore'
  | 'season_of_discovery'
  | 'anniversary';

export type WowRealm = {
  name: string;
  slug: string;
  region: WowRegion;
};

export const WOW_VERSION_OPTIONS: { id: WowVersion; label: string }[] = [
  { id: 'progression', label: 'Progression (Cataclysm Classic)' },
  { id: 'classic_era', label: 'Classic Era' },
  { id: 'hardcore', label: 'Hardcore' },
  { id: 'season_of_discovery', label: 'Season of Discovery' },
  { id: 'anniversary', label: 'Classic 20th Anniversary' },
];

