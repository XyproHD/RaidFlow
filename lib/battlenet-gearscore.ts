import { prisma } from '@/lib/prisma';
import { battlenetBearerInit, getBattlenetAccessToken, getBattlenetConfigForRegion } from '@/lib/battlenet';
import { calculateGearscoreFromItems, type GearscoreItem } from '@/lib/gearscore';

type BnetEquipmentItem = {
  level?: { value?: number };
  item_level?: number;
  quality?: { type?: string };
  inventory_type?: { type?: string };
  slot?: { type?: string };
};

type BnetEquipmentPayload = {
  equipped_items?: BnetEquipmentItem[];
};

function extractEquipmentHref(rawProfile: unknown): string | null {
  if (!rawProfile || typeof rawProfile !== 'object') return null;
  const root = rawProfile as Record<string, unknown>;
  const profileNode =
    root.profile && typeof root.profile === 'object'
      ? (root.profile as Record<string, unknown>)
      : root;
  const links = profileNode._links as { equipment?: { href?: string } } | undefined;
  const href = links?.equipment?.href;
  return typeof href === 'string' && href.trim().length > 0 ? href : null;
}

function toGearscoreItems(payload: BnetEquipmentPayload): GearscoreItem[] {
  return (payload.equipped_items ?? [])
    .map((item) => {
      const itemLevel = Number(item.item_level ?? item.level?.value ?? 0);
      const qualityType = item.quality?.type ?? '';
      const inventoryType = item.inventory_type?.type ?? '';
      if (!Number.isFinite(itemLevel) || itemLevel <= 0 || !qualityType || !inventoryType) return null;
      return {
        itemLevel,
        qualityType,
        inventoryType,
        slotType: item.slot?.type ?? null,
      } satisfies GearscoreItem;
    })
    .filter((x): x is GearscoreItem => x != null);
}

export async function refreshCharacterGearscore(characterId: string): Promise<{
  currentScore: number;
  storedScore: number | null;
  savedHighScore: number;
}> {
  const character = await prisma.rfCharacter.findUnique({
    where: { id: characterId },
    include: { battlenetProfile: true },
  });
  if (!character) throw new Error('Charakter nicht gefunden.');
  if (!character.battlenetProfile?.battlenetCharacterId) {
    throw new Error('Charakter ist nicht mit Battle.net verknüpft.');
  }

  const region = character.battlenetProfile.region as 'eu' | 'us' | 'kr' | 'tw' | 'cn';
  const config = await getBattlenetConfigForRegion(region);
  if (!config) throw new Error('Keine aktive Battle.net Konfiguration gefunden.');
  const accessToken = await getBattlenetAccessToken(config);

  const equipmentHref = extractEquipmentHref(character.battlenetProfile.rawProfile);
  if (!equipmentHref) throw new Error('Keine Battle.net Equipment-Referenz gefunden. Bitte BNet Sync erneut ausführen.');

  const equipmentUrl = new URL(equipmentHref);
  equipmentUrl.searchParams.set('locale', config.locale);
  equipmentUrl.searchParams.delete('access_token');
  const eqRes = await fetch(equipmentUrl.toString(), battlenetBearerInit(accessToken));
  if (!eqRes.ok) {
    throw new Error(`Battle.net Equipment-Abfrage fehlgeschlagen (HTTP ${eqRes.status}).`);
  }

  const payload = (await eqRes.json()) as BnetEquipmentPayload;
  const items = toGearscoreItems(payload);
  const className = character.battlenetProfile.className ?? null;
  const { score } = calculateGearscoreFromItems(items, className);
  const savedHighScore = character.gearScore == null ? score : Math.max(character.gearScore, score);

  if (savedHighScore !== character.gearScore) {
    await prisma.rfCharacter.update({
      where: { id: characterId },
      data: { gearScore: savedHighScore },
    });
  }

  return {
    currentScore: score,
    storedScore: character.gearScore ?? null,
    savedHighScore,
  };
}

export async function refreshAllBattlenetCharactersForUser(userId: string): Promise<void> {
  const characters = await prisma.rfCharacter.findMany({
    where: {
      userId,
      battlenetProfile: { is: { battlenetCharacterId: { not: null } } },
    },
    select: { id: true },
  });
  for (const c of characters) {
    try {
      await refreshCharacterGearscore(c.id);
    } catch (error) {
      console.error('[Gearscore login refresh] failed for character', c.id, error);
    }
  }
}
