import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireGuildMasterOrForbid } from '@/lib/guild-master';
import type { WowRegion } from '@/lib/wow-classic-realms';
import {
  autoResolveWowGuild,
  searchWowGuildsOnRealm,
  type WowGuildSearchHit,
} from '@/lib/battlenet-guild';

function hitToJson(hit: WowGuildSearchHit) {
  return {
    id: hit.id.toString(),
    name: hit.name,
    realmSlug: hit.realmSlug,
  };
}

/**
 * GET — gespeicherte Battle.net-Verknüpfung + Discord-Gildenname (für Auto-Suche).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  const { guildId } = await params;
  const auth = await requireGuildMasterOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  const guild = await prisma.rfGuild.findUnique({
    where: { id: guildId },
    select: {
      name: true,
      battlenetRealmId: true,
      battlenetGuildId: true,
      battlenetGuildName: true,
    },
  });
  if (!guild) {
    return NextResponse.json({ error: 'Guild not found' }, { status: 404 });
  }

  return NextResponse.json({
    discordGuildName: guild.name,
    battlenetRealmId: guild.battlenetRealmId,
    battlenetGuildId: guild.battlenetGuildId?.toString() ?? null,
    battlenetGuildName: guild.battlenetGuildName,
  });
}

/**
 * POST — action: "search" | "auto"
 * Body: { action, realmId: string, query?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  const { guildId } = await params;
  const auth = await requireGuildMasterOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  let body: { action?: string; realmId?: string; query?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body.action;
  const realmId = typeof body.realmId === 'string' ? body.realmId.trim() : '';
  if (!realmId) {
    return NextResponse.json({ error: 'realmId is required' }, { status: 400 });
  }

  const realm = await prisma.rfBattlenetRealm.findUnique({
    where: { id: realmId },
  });
  if (!realm) {
    return NextResponse.json({ error: 'Realm not found' }, { status: 404 });
  }

  const realmArg = {
    region: realm.region as WowRegion,
    slug: realm.slug,
    namespace: realm.namespace,
  };

  try {
    if (action === 'search') {
      const query = typeof body.query === 'string' ? body.query : '';
      const hits = await searchWowGuildsOnRealm(realmArg, query);
      return NextResponse.json({ results: hits.map(hitToJson) });
    }

    if (action === 'auto') {
      const guild = await prisma.rfGuild.findUnique({
        where: { id: guildId },
        select: { name: true },
      });
      if (!guild) {
        return NextResponse.json({ error: 'Guild not found' }, { status: 404 });
      }

      const resolved = await autoResolveWowGuild(realmArg, guild.name);
      if (resolved.status === 'ok') {
        return NextResponse.json({ status: 'ok', guild: hitToJson(resolved.guild) });
      }
      if (resolved.status === 'ambiguous') {
        return NextResponse.json({
          status: 'ambiguous',
          guilds: resolved.guilds.map(hitToJson),
        });
      }
      return NextResponse.json({ status: 'not_found' });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[battlenet-link POST]', e);
    return NextResponse.json(
      { error: message },
      { status: 502 }
    );
  }
}

/**
 * PATCH — Battle.net-Gilde und Realm speichern oder Verknüpfung entfernen.
 * Body: { battlenetRealmId, battlenetGuildId, battlenetGuildName } — alle drei null = löschen.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  const { guildId } = await params;
  const auth = await requireGuildMasterOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  let body: {
    battlenetRealmId?: string | null;
    battlenetGuildId?: string | null;
    battlenetGuildName?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const clear =
    body.battlenetRealmId === null &&
    body.battlenetGuildId === null &&
    body.battlenetGuildName === null;

  if (clear) {
    try {
      const updated = await prisma.rfGuild.update({
        where: { id: guildId },
        data: {
          battlenetRealmId: null,
          battlenetGuildId: null,
          battlenetGuildName: null,
        },
        select: {
          battlenetRealmId: true,
          battlenetGuildId: true,
          battlenetGuildName: true,
        },
      });
      return NextResponse.json({
        battlenetRealmId: updated.battlenetRealmId,
        battlenetGuildId: null,
        battlenetGuildName: null,
      });
    } catch (e) {
      console.error('[battlenet-link PATCH]', e);
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
  }

  const realmId =
    typeof body.battlenetRealmId === 'string' ? body.battlenetRealmId.trim() : '';
  if (!realmId) {
    return NextResponse.json(
      { error: 'battlenetRealmId is required (or pass all null to clear)' },
      { status: 400 }
    );
  }

  const exists = await prisma.rfBattlenetRealm.findUnique({
    where: { id: realmId },
    select: { id: true },
  });
  if (!exists) {
    return NextResponse.json({ error: 'Realm not found' }, { status: 400 });
  }

  let guildIdBn: bigint;
  try {
    const raw = String(body.battlenetGuildId ?? '').trim();
    if (!raw) {
      return NextResponse.json({ error: 'battlenetGuildId is required' }, { status: 400 });
    }
    guildIdBn = BigInt(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid battlenetGuildId' }, { status: 400 });
  }

  const guildNameBn =
    typeof body.battlenetGuildName === 'string' ? body.battlenetGuildName.trim() : '';
  if (!guildNameBn) {
    return NextResponse.json({ error: 'battlenetGuildName is required' }, { status: 400 });
  }

  try {
    const updated = await prisma.rfGuild.update({
      where: { id: guildId },
      data: {
        battlenetRealmId: realmId,
        battlenetGuildId: guildIdBn,
        battlenetGuildName: guildNameBn,
      },
      select: {
        battlenetRealmId: true,
        battlenetGuildId: true,
        battlenetGuildName: true,
      },
    });

    return NextResponse.json({
      battlenetRealmId: updated.battlenetRealmId,
      battlenetGuildId: updated.battlenetGuildId?.toString() ?? null,
      battlenetGuildName: updated.battlenetGuildName,
    });
  } catch (e) {
    console.error('[battlenet-link PATCH]', e);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
