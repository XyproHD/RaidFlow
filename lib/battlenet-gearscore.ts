import { prisma } from '@/lib/prisma';
import { battlenetBearerInit, getBattlenetAccessToken, getBattlenetConfigForRegion } from '@/lib/battlenet';
import { calculateGearscoreFromItems, type GearscoreItem } from '@/lib/gearscore';
import type { WowRegion } from '@/lib/wow-classic-realms';
import { isMissingGearScoreColumnError } from '@/lib/rf-character-gear-score-compat';

function toWowRegion(region: string): WowRegion {
  const r = region.trim().toLowerCase();
  if (r === 'eu' || r === 'us' || r === 'kr' || r === 'tw') return r;
  return 'eu';
}

type BnetEquipmentItem = {
  level?: { value?: number };
  item_level?: number;
  item?: { key?: { href?: string } };
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
  const candidates: Record<string, unknown>[] = [];
  candidates.push(root);
  if (root.profile && typeof root.profile === 'object') {
    candidates.push(root.profile as Record<string, unknown>);
  }
  for (const candidate of candidates) {
    const links = candidate._links as { equipment?: { href?: string } } | undefined;
    const href = links?.equipment?.href;
    if (typeof href === 'string' && href.trim().length > 0) return href;
  }
  return null;
}

function profileNamespaceForWowVersion(region: WowRegion, wowVersion: string | null | undefined): string {
  const v = (wowVersion ?? '').trim().toLowerCase();
  if (v === 'anniversary' || v === 'tbc') return `profile-classicann-${region}`;
  if (v === 'progression' || v === 'mop') return `profile-classic-${region}`;
  return `profile-classic1x-${region}`;
}

async function resolveEquipmentHrefViaProfileFetch(
  character: Awaited<ReturnType<typeof loadCharacterWithBattlenetProfile>>,
  config: Awaited<ReturnType<typeof getBattlenetConfigForRegion>>,
  accessToken: string
): Promise<string | null> {
  if (!character?.battlenetProfile || !config) return null;
  const realmSlug = character.battlenetProfile.realmSlug?.trim().toLowerCase();
  const characterNameLower = character.battlenetProfile.characterNameLower?.trim().toLowerCase();
  if (!realmSlug || !characterNameLower) return null;

  const region = toWowRegion(character.battlenetProfile.region);
  const namespace = profileNamespaceForWowVersion(region, character.battlenetProfile.wowVersion);
  const profileUrl = new URL(`${config.apiBaseUrl}${config.profileCharacterPath}/${realmSlug}/${characterNameLower}`);
  profileUrl.searchParams.set('namespace', namespace);
  profileUrl.searchParams.set('locale', config.locale);

  try {
    const res = await fetch(profileUrl.toString(), battlenetBearerInit(accessToken));
    if (!res.ok) return null;
    const profilePayload = (await res.json()) as unknown;
    return extractEquipmentHref(profilePayload);
  } catch {
    return null;
  }
}

function toGearscoreItems(payload: BnetEquipmentPayload): GearscoreItem[] {
  return (payload.equipped_items ?? []).flatMap((item): GearscoreItem[] => {
    const itemLevel = Number(item.item_level ?? item.level?.value ?? 0);
    const qualityType = item.quality?.type ?? '';
    const inventoryType = item.inventory_type?.type ?? '';
    if (!Number.isFinite(itemLevel) || itemLevel <= 0 || !qualityType || !inventoryType) return [];
    return [
      {
        itemLevel,
        qualityType,
        inventoryType,
        slotType: item.slot?.type ?? null,
      },
    ];
  });
}

async function resolveItemLevelFromHref(
  href: string,
  accessToken: string,
  locale: string
): Promise<number | null> {
  try {
    const url = new URL(href);
    url.searchParams.set('locale', locale);
    url.searchParams.delete('access_token');
    const res = await fetch(url.toString(), battlenetBearerInit(accessToken));
    if (!res.ok) return null;
    const json = (await res.json()) as {
      level?: number;
      preview_item?: { level?: { value?: number }; item_level?: number };
    };
    const level = Number(json.level ?? json.preview_item?.level?.value ?? json.preview_item?.item_level ?? 0);
    if (!Number.isFinite(level) || level <= 0) return null;
    return level;
  } catch {
    return null;
  }
}

async function toGearscoreItemsWithItemFallback(
  payload: BnetEquipmentPayload,
  accessToken: string,
  locale: string
): Promise<GearscoreItem[]> {
  const out: GearscoreItem[] = [];
  for (const item of payload.equipped_items ?? []) {
    const qualityType = item.quality?.type ?? '';
    const inventoryType = item.inventory_type?.type ?? '';
    if (!qualityType || !inventoryType) continue;

    let itemLevel = Number(item.item_level ?? item.level?.value ?? 0);
    if (!Number.isFinite(itemLevel) || itemLevel <= 0) {
      const href = item.item?.key?.href;
      if (typeof href === 'string' && href.trim().length > 0) {
        const resolved = await resolveItemLevelFromHref(href, accessToken, locale);
        if (resolved != null) itemLevel = resolved;
      }
    }
    if (!Number.isFinite(itemLevel) || itemLevel <= 0) continue;
    out.push({
      itemLevel,
      qualityType,
      inventoryType,
      slotType: item.slot?.type ?? null,
    });
  }
  return out;
}

async function loadCharacterWithBattlenetProfile(characterId: string) {
  try {
    return await prisma.rfCharacter.findUnique({
      where: { id: characterId },
      include: { battlenetProfile: true },
    });
  } catch (e) {
    if (!isMissingGearScoreColumnError(e)) throw e;
    const row = await prisma.rfCharacter.findUnique({
      where: { id: characterId },
      select: {
        id: true,
        userId: true,
        guildId: true,
        name: true,
        mainSpec: true,
        offSpec: true,
        isMain: true,
        guildDiscordDisplayName: true,
        createdAt: true,
        updatedAt: true,
        battlenetProfile: true,
      },
    });
    if (!row) return null;
    return { ...row, gearScore: null as number | null };
  }
}

export async function refreshCharacterGearscore(characterId: string): Promise<{
  currentScore: number;
  storedScore: number | null;
  savedHighScore: number;
}> {
  const character = await loadCharacterWithBattlenetProfile(characterId);
  if (!character) throw new Error('Charakter nicht gefunden.');
  if (!character.battlenetProfile?.battlenetCharacterId) {
    throw new Error('Charakter ist nicht mit Battle.net verknüpft.');
  }

  const config = await getBattlenetConfigForRegion(toWowRegion(character.battlenetProfile.region));
  if (!config) throw new Error('Keine aktive Battle.net Konfiguration gefunden.');
  const accessToken = await getBattlenetAccessToken(config);

  const equipmentHref =
    extractEquipmentHref(character.battlenetProfile.rawProfile) ??
    (await resolveEquipmentHrefViaProfileFetch(character, config, accessToken));
  if (!equipmentHref) throw new Error('Keine Battle.net Equipment-Referenz gefunden. Bitte BNet Sync erneut ausführen.');

  const equipmentUrl = new URL(equipmentHref);
  equipmentUrl.searchParams.set('locale', config.locale);
  equipmentUrl.searchParams.delete('access_token');
  const eqRes = await fetch(equipmentUrl.toString(), battlenetBearerInit(accessToken));
  if (!eqRes.ok) {
    throw new Error(`Battle.net Equipment-Abfrage fehlgeschlagen (HTTP ${eqRes.status}).`);
  }

  const payload = (await eqRes.json()) as BnetEquipmentPayload;
  let items = toGearscoreItems(payload);
  if (items.length === 0 && (payload.equipped_items?.length ?? 0) > 0) {
    items = await toGearscoreItemsWithItemFallback(payload, accessToken, config.locale);
  }
  const className = character.battlenetProfile.className ?? null;
  const { score } = calculateGearscoreFromItems(items, className);
  const savedHighScore = character.gearScore == null ? score : Math.max(character.gearScore, score);

  if (savedHighScore !== character.gearScore) {
    try {
      await prisma.rfCharacter.update({
        where: { id: characterId },
        data: { gearScore: savedHighScore },
      });
    } catch (e) {
      if (isMissingGearScoreColumnError(e)) {
        throw new Error(
          'Die Datenbank hat noch keine Spalte gear_score. Bitte Migration anwenden (Supabase SQL oder prisma migrate deploy).'
        );
      }
      throw e;
    }
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
