/**
 * Mapping Rollen (Tank, Melee, Range, Healer) und Specs auf Icon-Pfade und Labels.
 * Icons liegen unter public/icons/wow/; können durch echte WoW-Assets ersetzt werden.
 */

const ICON_BASE = '/icons/wow';

export const ROLE_ICONS: Record<string, { src: string; labelKey: string }> = {
  Tank: { src: `${ICON_BASE}/role-tank.svg`, labelKey: 'roleTank' },
  Melee: { src: `${ICON_BASE}/role-melee.svg`, labelKey: 'roleMelee' },
  Range: { src: `${ICON_BASE}/role-range.svg`, labelKey: 'roleRange' },
  Healer: { src: `${ICON_BASE}/role-healer.svg`, labelKey: 'roleHealer' },
};

/** Bekannte Specs mit eigenem Icon; unbekannte nutzen spec-default.svg */
export const SPEC_ICONS: Record<string, string> = {
  'Fire Mage': 'spec-fire-mage.svg',
  'Frost Mage': 'spec-frost-mage.svg',
  'Arcane Mage': 'spec-arcane-mage.svg',
  'Protection Warrior': 'spec-prot-warrior.svg',
  'Arms Warrior': 'spec-arms-warrior.svg',
  'Fury Warrior': 'spec-fury-warrior.svg',
  'Restoration Shaman': 'spec-resto-shaman.svg',
  'Elemental Shaman': 'spec-ele-shaman.svg',
  'Enhancement Shaman': 'spec-enhance-shaman.svg',
  'Holy Priest': 'spec-holy-priest.svg',
  'Shadow Priest': 'spec-shadow-priest.svg',
  'Discipline Priest': 'spec-disc-priest.svg',
  'Restoration Druid': 'spec-resto-druid.svg',
  'Feral Druid': 'spec-feral-druid.svg',
  'Balance Druid': 'spec-balance-druid.svg',
  'Holy Paladin': 'spec-holy-paladin.svg',
  'Protection Paladin': 'spec-prot-paladin.svg',
  'Retribution Paladin': 'spec-ret-paladin.svg',
  'Beast Mastery Hunter': 'spec-bm-hunter.svg',
  'Marksmanship Hunter': 'spec-marks-hunter.svg',
  'Survival Hunter': 'spec-surv-hunter.svg',
  'Affliction Warlock': 'spec-affli-warlock.svg',
  'Demonology Warlock': 'spec-demo-warlock.svg',
  'Destruction Warlock': 'spec-destro-warlock.svg',
  'Combat Rogue': 'spec-combat-rogue.svg',
  'Assassination Rogue': 'spec-assa-rogue.svg',
  'Subtlety Rogue': 'spec-sub-rogue.svg',
};

export function getRoleIcon(role: string): { src: string; labelKey: string } {
  return ROLE_ICONS[role] ?? { src: `${ICON_BASE}/role-unknown.svg`, labelKey: 'roleUnknown' };
}

/** Gibt Icon-Pfad für Spec zurück. Derzeit einheitlich spec-default.svg; SPEC_ICONS kann genutzt werden, sobald entsprechende Dateien unter public/icons/wow/ liegen. */
export function getSpecIconPath(spec: string): string {
  const filename = SPEC_ICONS[spec];
  return filename ? `${ICON_BASE}/${filename}` : `${ICON_BASE}/spec-default.svg`;
}
