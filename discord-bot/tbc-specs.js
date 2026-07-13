/**
 * TBC-Klassen/Specs (Anzeigenamen wie in lib/wow-tbc-classes.ts / DB main_spec).
 */
const CLASS_EN = {
  druid: 'Druid',
  hunter: 'Hunter',
  mage: 'Mage',
  paladin: 'Paladin',
  priest: 'Priest',
  rogue: 'Rogue',
  shaman: 'Shaman',
  warlock: 'Warlock',
  warrior: 'Warrior',
};

export const TBC_CLASSES = [
  {
    id: 'druid',
    name: 'Druide',
    specs: [
      { id: 'balance', name: 'Balance' },
      { id: 'feral', name: 'Feral' },
      { id: 'feral-dps', name: 'Feral (DPS)' },
      { id: 'restoration', name: 'Restoration' },
    ],
  },
  {
    id: 'hunter',
    name: 'Jäger',
    specs: [
      { id: 'beast-mastery', name: 'Beast Mastery' },
      { id: 'marksmanship', name: 'Marksmanship' },
      { id: 'survival', name: 'Survival' },
    ],
  },
  {
    id: 'mage',
    name: 'Magier',
    specs: [
      { id: 'arcane', name: 'Arcane' },
      { id: 'fire', name: 'Fire' },
      { id: 'frost', name: 'Frost' },
    ],
  },
  {
    id: 'paladin',
    name: 'Paladin',
    specs: [
      { id: 'holy', name: 'Holy' },
      { id: 'protection', name: 'Protection' },
      { id: 'retribution', name: 'Retribution' },
    ],
  },
  {
    id: 'priest',
    name: 'Priester',
    specs: [
      { id: 'discipline', name: 'Discipline' },
      { id: 'holy', name: 'Holy' },
      { id: 'shadow', name: 'Shadow' },
    ],
  },
  {
    id: 'rogue',
    name: 'Schurke',
    specs: [
      { id: 'assassination', name: 'Assassination' },
      { id: 'combat', name: 'Combat' },
      { id: 'subtlety', name: 'Subtlety' },
    ],
  },
  {
    id: 'shaman',
    name: 'Schamane',
    specs: [
      { id: 'elemental', name: 'Elemental' },
      { id: 'enhancement', name: 'Enhancement' },
      { id: 'restoration', name: 'Restoration' },
    ],
  },
  {
    id: 'warlock',
    name: 'Hexenmeister',
    specs: [
      { id: 'affliction', name: 'Affliction' },
      { id: 'demonology', name: 'Demonology' },
      { id: 'destruction', name: 'Destruction' },
    ],
  },
  {
    id: 'warrior',
    name: 'Krieger',
    specs: [
      { id: 'arms', name: 'Arms' },
      { id: 'fury', name: 'Fury' },
      { id: 'protection', name: 'Protection' },
    ],
  },
];

export function getSpecDisplayName(classId, specId) {
  const cls = TBC_CLASSES.find((c) => c.id === classId);
  const spec = cls?.specs.find((s) => s.id === specId);
  if (!spec) return specId;
  const c = CLASS_EN[classId] ?? classId;
  return `${spec.name} ${c}`;
}

export function getSpecsForClass(classId) {
  return TBC_CLASSES.find((c) => c.id === classId)?.specs ?? [];
}

/** Englische Klassenbezeichnung aus Battle.net → TBC_CLASSES.id */
export function battlenetClassNameToTbcClassId(className) {
  if (!className?.trim()) return '';
  const n = className.trim().toLowerCase();
  const map = {
    druid: 'druid',
    druide: 'druid',
    hunter: 'hunter',
    jager: 'hunter',
    jäger: 'hunter',
    mage: 'mage',
    magier: 'mage',
    paladin: 'paladin',
    priest: 'priest',
    priester: 'priest',
    rogue: 'rogue',
    schurke: 'rogue',
    shaman: 'shaman',
    schamane: 'shaman',
    warlock: 'warlock',
    hexenmeister: 'warlock',
    warrior: 'warrior',
    krieger: 'warrior',
  };
  return map[n] ?? '';
}

/** className und/oder mainSpec (z. B. „Fire Mage“) → classId */
export function resolveClassIdFromBnetResponse(json) {
  const fromClass = battlenetClassNameToTbcClassId(json?.profile?.className);
  if (fromClass) return fromClass;
  const mainSpec = typeof json?.mainSpec === 'string' ? json.mainSpec.trim() : '';
  if (mainSpec) {
    const parsed = getSpecByDisplayName(mainSpec);
    if (parsed) return parsed.classId;
  }
  const activeSpec =
    typeof json?.profile?.activeSpecName === 'string' ? json.profile.activeSpecName.trim() : '';
  if (activeSpec) {
    const parsedActive = getSpecByDisplayName(activeSpec);
    if (parsedActive) return parsedActive.classId;
  }
  return '';
}

export function getSpecByDisplayName(displayName) {
  for (const cls of TBC_CLASSES) {
    for (const spec of cls.specs) {
      if (getSpecDisplayName(cls.id, spec.id) === displayName) {
        return { classId: cls.id, specId: spec.id };
      }
    }
  }
  return null;
}
