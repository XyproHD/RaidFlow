/**
 * Mapping Rollen, Klassen und Specs auf Icon-Pfade.
 * Icons aus C:\tmp\wow nach public/icons/wow/ kopieren; Unterordner-Struktur beibehalten.
 * Matching per Dateiname: classes/<classId>.png, specs/<spec-dateiname>.png
 */

const ICON_BASE = '/icons/wow';
const CLASSES_BASE = `${ICON_BASE}/classes`;
const SPECS_BASE = `${ICON_BASE}/specs`;

export const ROLE_ICONS: Record<string, { src: string; labelKey: string }> = {
  Tank: { src: `${ICON_BASE}/role-tank.svg`, labelKey: 'roleTank' },
  Melee: { src: `${ICON_BASE}/role-melee.svg`, labelKey: 'roleMelee' },
  Range: { src: `${ICON_BASE}/role-range.svg`, labelKey: 'roleRange' },
  Healer: { src: `${ICON_BASE}/role-healer.svg`, labelKey: 'roleHealer' },
};

/** Spec → Dateiname (ohne Ordner) für icons/wow/specs/. Sortierung wie in C:\tmp\wow Unterordnern. */
export const SPEC_ICON_FILES: Record<string, string> = {
  'Fire Mage': 'fire-mage.png',
  'Frost Mage': 'frost-mage.png',
  'Arcane Mage': 'arcane-mage.png',
  'Protection Warrior': 'protection-warrior.png',
  'Arms Warrior': 'arms-warrior.png',
  'Fury Warrior': 'fury-warrior.png',
  'Restoration Shaman': 'restoration-shaman.png',
  'Elemental Shaman': 'elemental-shaman.png',
  'Enhancement Shaman': 'enhancement-shaman.png',
  'Holy Priest': 'holy-priest.png',
  'Shadow Priest': 'shadow-priest.png',
  'Discipline Priest': 'discipline-priest.png',
  'Restoration Druid': 'restoration-druid.png',
  'Feral Druid': 'feral-druid.png',
  'Feral (DPS) Druid': 'feral-druid.png',
  'Balance Druid': 'balance-druid.png',
  'Holy Paladin': 'holy-paladin.png',
  'Protection Paladin': 'protection-paladin.png',
  'Retribution Paladin': 'retribution-paladin.png',
  'Beast Mastery Hunter': 'beast-mastery-hunter.png',
  'Marksmanship Hunter': 'marksmanship-hunter.png',
  'Survival Hunter': 'survival-hunter.png',
  'Affliction Warlock': 'affliction-warlock.png',
  'Demonology Warlock': 'demonology-warlock.png',
  'Destruction Warlock': 'destruction-warlock.png',
  'Combat Rogue': 'combat-rogue.png',
  'Assassination Rogue': 'assassination-rogue.png',
  'Subtlety Rogue': 'subtlety-rogue.png',
};

/** TBC-Klassen-IDs für Class-Icon (Dateiname: <id>.png unter icons/wow/classes/). */
export const CLASS_ICON_IDS = ['druid', 'hunter', 'mage', 'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior'] as const;

export function getRoleIcon(role: string): { src: string; labelKey: string } {
  return ROLE_ICONS[role] ?? { src: `${ICON_BASE}/role-unknown.svg`, labelKey: 'roleUnknown' };
}

/** Klassen-Icon-Pfad (public/icons/wow/classes/<classId>.png). Icons aus C:\tmp\wow\classes\ kopieren. */
export function getClassIconPath(classId: string): string {
  return `${CLASSES_BASE}/${classId}.png`;
}

/** Spec-Icon-Pfad (public/icons/wow/specs/<dateiname>.png). Icons aus C:\tmp\wow\specs\ Unterordnern kopieren, Matching per Dateiname. */
export function getSpecIconPath(spec: string): string {
  const filename = SPEC_ICON_FILES[spec];
  return filename ? `${SPECS_BASE}/${filename}` : `${ICON_BASE}/spec-default.svg`;
}
