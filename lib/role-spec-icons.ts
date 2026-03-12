/**
 * Mapping Rollen, Klassen und Specs auf PNG-Icon-Pfade.
 * Icons: public/icons/wow/ (roles/, classes/, specs/<class>/).
 */

const ICON_BASE = '/icons/wow';
const CLASSES_BASE = `${ICON_BASE}/classes`;
const SPECS_BASE = `${ICON_BASE}/specs`;
const ROLES_BASE = `${ICON_BASE}/roles`;

export const ROLE_ICONS: Record<string, { src: string; labelKey: string }> = {
  Tank: { src: `${ROLES_BASE}/tank.png`, labelKey: 'roleTank' },
  Melee: { src: `${ROLES_BASE}/melee.png`, labelKey: 'roleMelee' },
  Range: { src: `${ROLES_BASE}/range.png`, labelKey: 'roleRange' },
  Healer: { src: `${ROLES_BASE}/heal.png`, labelKey: 'roleHealer' },
};

/** Spec-Anzeigename → relativer Pfad unter specs/ (z. B. "mage/fire.png"). */
export const SPEC_ICON_PATHS: Record<string, string> = {
  'Fire Mage': 'mage/fire.png',
  'Frost Mage': 'mage/frost.png',
  'Arcane Mage': 'mage/arcane.png',
  'Protection Warrior': 'warrior/protection.png',
  'Arms Warrior': 'warrior/arms.png',
  'Fury Warrior': 'warrior/fury.png',
  'Restoration Shaman': 'shaman/restoration.png',
  'Elemental Shaman': 'shaman/elemental.png',
  'Enhancement Shaman': 'shaman/enhancement.png',
  'Holy Priest': 'priest/holy.png',
  'Shadow Priest': 'priest/shadow.png',
  'Discipline Priest': 'priest/discipline.png',
  'Restoration Druid': 'druid/restoration.png',
  'Feral Druid': 'druid/feral.png',
  'Feral (DPS) Druid': 'druid/feral.png',
  'Balance Druid': 'druid/balance.png',
  'Holy Paladin': 'paladin/holy.png',
  'Protection Paladin': 'paladin/protection.png',
  'Retribution Paladin': 'paladin/retribution.png',
  'Beast Mastery Hunter': 'hunter/beastmastery.png',
  'Marksmanship Hunter': 'hunter/marksman.png',
  'Survival Hunter': 'hunter/survival.png',
  'Affliction Warlock': 'warlock/affliction.png',
  'Demonology Warlock': 'warlock/demonology.png',
  'Destruction Warlock': 'warlock/destruction.png',
  'Combat Rogue': 'rogue/combat.png',
  'Assassination Rogue': 'rogue/assassination.png',
  'Subtlety Rogue': 'rogue/subtlety.png',
};

/** TBC-Klassen-IDs für Class-Icon (Dateiname: <id>.png unter icons/wow/classes/). */
export const CLASS_ICON_IDS = ['druid', 'hunter', 'mage', 'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior'] as const;

export function getRoleIcon(role: string): { src: string; labelKey: string } {
  return ROLE_ICONS[role] ?? { src: `${ROLES_BASE}/melee.png`, labelKey: 'roleUnknown' };
}

export function getClassIconPath(classId: string): string {
  return `${CLASSES_BASE}/${classId}.png`;
}

export function getSpecIconPath(spec: string): string {
  const path = SPEC_ICON_PATHS[spec];
  return path ? `${SPECS_BASE}/${path}` : `${CLASSES_BASE}/mage.png`;
}
