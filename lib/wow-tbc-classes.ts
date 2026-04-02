/**
 * WoW TBC: Klassen und Specs mit Rollen (Tank, Healer, Melee, Range).
 * Nur TBC-relevante Kombinationen.
 */

export type TbcRole = 'Tank' | 'Healer' | 'Melee' | 'Range';

export interface TbcSpec {
  id: string;
  name: string;
  role: TbcRole;
}

export interface TbcClass {
  id: string;
  name: string;
  specs: TbcSpec[];
}

export const TBC_CLASSES: TbcClass[] = [
  {
    id: 'druid',
    name: 'Druide',
    specs: [
      { id: 'balance', name: 'Balance', role: 'Range' },
      { id: 'feral', name: 'Feral', role: 'Tank' },
      { id: 'feral-dps', name: 'Feral (DPS)', role: 'Melee' },
      { id: 'restoration', name: 'Restoration', role: 'Healer' },
    ],
  },
  {
    id: 'hunter',
    name: 'Jäger',
    specs: [
      { id: 'beast-mastery', name: 'Beast Mastery', role: 'Range' },
      { id: 'marksmanship', name: 'Marksmanship', role: 'Range' },
      { id: 'survival', name: 'Survival', role: 'Range' },
    ],
  },
  {
    id: 'mage',
    name: 'Magier',
    specs: [
      { id: 'arcane', name: 'Arcane', role: 'Range' },
      { id: 'fire', name: 'Fire', role: 'Range' },
      { id: 'frost', name: 'Frost', role: 'Range' },
    ],
  },
  {
    id: 'paladin',
    name: 'Paladin',
    specs: [
      { id: 'holy', name: 'Holy', role: 'Healer' },
      { id: 'protection', name: 'Protection', role: 'Tank' },
      { id: 'retribution', name: 'Retribution', role: 'Melee' },
    ],
  },
  {
    id: 'priest',
    name: 'Priester',
    specs: [
      { id: 'discipline', name: 'Discipline', role: 'Healer' },
      { id: 'holy', name: 'Holy', role: 'Healer' },
      { id: 'shadow', name: 'Shadow', role: 'Range' },
    ],
  },
  {
    id: 'rogue',
    name: 'Schurke',
    specs: [
      { id: 'assassination', name: 'Assassination', role: 'Melee' },
      { id: 'combat', name: 'Combat', role: 'Melee' },
      { id: 'subtlety', name: 'Subtlety', role: 'Melee' },
    ],
  },
  {
    id: 'shaman',
    name: 'Schamane',
    specs: [
      { id: 'elemental', name: 'Elemental', role: 'Range' },
      { id: 'enhancement', name: 'Enhancement', role: 'Melee' },
      { id: 'restoration', name: 'Restoration', role: 'Healer' },
    ],
  },
  {
    id: 'warlock',
    name: 'Hexenmeister',
    specs: [
      { id: 'affliction', name: 'Affliction', role: 'Range' },
      { id: 'demonology', name: 'Demonology', role: 'Range' },
      { id: 'destruction', name: 'Destruction', role: 'Range' },
    ],
  },
  {
    id: 'warrior',
    name: 'Krieger',
    specs: [
      { id: 'arms', name: 'Arms', role: 'Melee' },
      { id: 'fury', name: 'Fury', role: 'Melee' },
      { id: 'protection', name: 'Protection', role: 'Tank' },
    ],
  },
];

/** Klassen-IDs in Reihenfolge wie `TBC_CLASSES` (z. B. Raidplaner Klassen-Filter). */
export const TBC_CLASS_IDS: readonly string[] = TBC_CLASSES.map((c) => c.id);

/** Englische Klassennamen für Spec-Display (Icon-Keys: "Fire Mage", "Protection Warrior") */
const CLASS_DISPLAY: Record<string, string> = {
  druid: 'Druid', hunter: 'Hunter', mage: 'Mage', paladin: 'Paladin',
  priest: 'Priest', rogue: 'Rogue', shaman: 'Shaman', warlock: 'Warlock', warrior: 'Warrior',
};

/** Kurzname z. B. für Mindestbesetzung „Klasse (egal welche Spec)“ / Discord-Zeilen. */
export function getClassEnglishName(classId: string): string {
  return CLASS_DISPLAY[classId] ?? classId;
}

/** Spec-Anzeigename für DB (main_spec/off_spec): z. B. "Fire Mage" für Kompatibilität mit Icons */
export function getSpecDisplayName(classId: string, specId: string): string {
  const cls = TBC_CLASSES.find((c) => c.id === classId);
  const spec = cls?.specs.find((s) => s.id === specId);
  if (!spec) return specId;
  const c = CLASS_DISPLAY[classId] ?? classId;
  return `${spec.name} ${c}`;
}

export function getSpecByDisplayName(displayName: string): { classId: string; specId: string } | null {
  for (const cls of TBC_CLASSES) {
    const spec = cls.specs.find((s) => {
      const dn = getSpecDisplayName(cls.id, s.id);
      return dn === displayName;
    });
    if (spec) return { classId: cls.id, specId: spec.id };
  }
  return null;
}

/** Alle Specs als flache Liste mit Display-Namen (für DB-Kompatibilität) */
export function getAllSpecDisplayNames(): { displayName: string; classId: string; specId: string; role: TbcRole }[] {
  const out: { displayName: string; classId: string; specId: string; role: TbcRole }[] = [];
  for (const cls of TBC_CLASSES) {
    for (const spec of cls.specs) {
      out.push({
        displayName: getSpecDisplayName(cls.id, spec.id),
        classId: cls.id,
        specId: spec.id,
        role: spec.role,
      });
    }
  }
  return out;
}
