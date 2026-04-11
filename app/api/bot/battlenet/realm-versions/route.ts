/**
 * Distinct WoW-Client-Versionen aus rf_battlenet_realm (für Discord: zuerst Version wählen).
 * Auth: BOT_SETUP_SECRET.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyBotSecret } from '@/lib/bot-auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rows = await prisma.rfBattlenetRealm.findMany({
      distinct: ['version'],
      select: { version: true },
      orderBy: { version: 'asc' },
    });
    const versions = rows
      .map((r) => r.version?.trim())
      .filter((v): v is string => Boolean(v));
    return NextResponse.json({ versions });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[bot/battlenet/realm-versions]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
