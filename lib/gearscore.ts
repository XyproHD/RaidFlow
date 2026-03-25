const SCALE = 1.8618;

const SLOT_MOD: Record<string, number> = {
  RELIC: 0.3164,
  TRINKET: 0.5625,
  TWOHWEAPON: 2.0,
  WEAPONMAINHAND: 1.0,
  WEAPONOFFHAND: 1.0,
  RANGED: 0.3164,
  THROWN: 0.3164,
  RANGEDRIGHT: 0.3164,
  SHIELD: 1.0,
  WEAPON: 1.0,
  HOLDABLE: 1.0,
  HEAD: 1.0,
  NECK: 0.5625,
  SHOULDER: 0.75,
  CHEST: 1.0,
  ROBE: 1.0,
  WAIST: 0.75,
  LEGS: 1.0,
  FEET: 0.75,
  WRIST: 0.5625,
  HAND: 0.75,
  FINGER: 0.5625,
  CLOAK: 0.5625,
  BODY: 0.0,
};

const FORMULA = {
  A: { 4: [91.45, 0.65], 3: [81.375, 0.8125], 2: [73.0, 1.0] },
  B: { 4: [26.0, 1.2], 3: [0.75, 1.8], 2: [8.0, 2.0], 1: [0.0, 2.25] },
  C: { 4: [0.25, 1.6275] },
} as const;

export type GearscoreItem = {
  itemLevel: number;
  qualityType: string;
  inventoryType: string;
  slotType?: string | null;
};

export type GearscoreResult = {
  score: number;
  averageItemLevel: number;
};

function normalizeQuality(qualityType: string, itemLevel: number) {
  const q = qualityType.trim().toUpperCase();
  if (q === 'LEGENDARY') return { rarity: 4 as const, itemLevel, qualityScale: 1.3 };
  if (q === 'COMMON' || q === 'POOR') return { rarity: 2 as const, itemLevel, qualityScale: 0.005 };
  if (q === 'HEIRLOOM') return { rarity: 3 as const, itemLevel: 187.05, qualityScale: 1.0 };
  if (q === 'EPIC') return { rarity: 4 as const, itemLevel, qualityScale: 1.0 };
  if (q === 'RARE') return { rarity: 3 as const, itemLevel, qualityScale: 1.0 };
  if (q === 'UNCOMMON') return { rarity: 2 as const, itemLevel, qualityScale: 1.0 };
  return { rarity: null, itemLevel, qualityScale: 1.0 };
}

function selectFormulaTable(itemLevel: number, rarity: number): keyof typeof FORMULA {
  if (itemLevel < 100 && rarity === 4) return 'C';
  if (itemLevel < 168 && rarity === 4) return 'B';
  if (itemLevel < 148 && rarity === 3) return 'B';
  if (itemLevel < 138 && rarity === 2) return 'B';
  if (itemLevel <= 120) return 'B';
  return 'A';
}

function itemScore(item: GearscoreItem): number {
  const invType = item.inventoryType.trim().toUpperCase();
  const slotMod = SLOT_MOD[invType];
  if (slotMod == null) return 0;

  const normalized = normalizeQuality(item.qualityType, item.itemLevel);
  if (normalized.rarity == null) return 0;

  const table = selectFormulaTable(normalized.itemLevel, normalized.rarity);
  const coeff = FORMULA[table][normalized.rarity as keyof (typeof FORMULA)[typeof table]];
  if (!coeff) return 0;

  const [a, b] = coeff;
  const raw = ((normalized.itemLevel - a) / b) * slotMod * SCALE * normalized.qualityScale;
  return Math.max(0, Math.floor(raw));
}

function slotNumberFromSlotType(slotType: string | null | undefined): number | null {
  if (!slotType) return null;
  const v = slotType.trim().toUpperCase();
  const map: Record<string, number> = {
    HEAD: 1,
    NECK: 2,
    SHOULDER: 3,
    BODY: 4,
    CHEST: 5,
    WAIST: 6,
    LEGS: 7,
    FEET: 8,
    WRIST: 9,
    HANDS: 10,
    HAND: 10,
    FINGER_1: 11,
    FINGER_2: 12,
    TRINKET_1: 13,
    TRINKET_2: 14,
    BACK: 15,
    CLOAK: 15,
    MAIN_HAND: 16,
    OFF_HAND: 17,
    RANGED: 18,
  };
  return map[v] ?? null;
}

export function calculateGearscoreFromItems(items: GearscoreItem[], characterClass?: string | null): GearscoreResult {
  if (!Array.isArray(items) || items.length === 0) {
    return { score: 0, averageItemLevel: 0 };
  }

  const isHunter = (characterClass ?? '').trim().toUpperCase() === 'HUNTER';
  const bySlotNumber = new Map<number, GearscoreItem>();
  const fallbackItems: GearscoreItem[] = [];

  for (const item of items) {
    const slotNum = slotNumberFromSlotType(item.slotType);
    if (slotNum == null) fallbackItems.push(item);
    else bySlotNumber.set(slotNum, item);
  }

  const mainHand = bySlotNumber.get(16);
  const offHand = bySlotNumber.get(17);
  const isMainTwoHand = mainHand?.inventoryType?.trim().toUpperCase() === 'TWOHWEAPON';
  const isOffTwoHand = offHand?.inventoryType?.trim().toUpperCase() === 'TWOHWEAPON';
  const titanGrip = isMainTwoHand || isOffTwoHand ? 0.5 : 1.0;

  let total = 0;
  let itemCount = 0;
  let levelTotal = 0;

  if (offHand) {
    let temp = itemScore(offHand);
    if (isHunter) {
      const inv = offHand.inventoryType.trim().toUpperCase();
      if (inv === 'WEAPON' || inv === 'WEAPONMAINHAND' || inv === 'WEAPONOFFHAND' || inv === 'TWOHWEAPON') {
        temp *= 0.3164;
      }
    }
    temp *= titanGrip;
    total += temp;
    itemCount += 1;
    levelTotal += offHand.itemLevel;
  }

  for (let slot = 1; slot <= 18; slot++) {
    if (slot === 4 || slot === 17) continue;
    const item = bySlotNumber.get(slot);
    if (!item) continue;
    let temp = itemScore(item);
    if (isHunter) {
      if (slot === 16) temp *= 0.3164;
      if (slot === 18) temp *= 5.3224;
    }
    if (slot === 16) temp *= titanGrip;
    total += temp;
    itemCount += 1;
    levelTotal += item.itemLevel;
  }

  for (const item of fallbackItems) {
    if (item.inventoryType.trim().toUpperCase() === 'BODY') continue;
    total += itemScore(item);
    itemCount += 1;
    levelTotal += item.itemLevel;
  }

  if (itemCount <= 0) return { score: 0, averageItemLevel: 0 };
  return {
    score: Math.floor(total),
    averageItemLevel: Math.floor(levelTotal / itemCount),
  };
}
