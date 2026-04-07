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
