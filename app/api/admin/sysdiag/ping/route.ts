import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOwner } from '@/lib/require-owner';

export const dynamic = 'force-dynamic';

/**
 * Owner-only DB probe endpoint for repeated latency measurements.
 */
export async function GET() {
  const owner = await requireOwner();
  if (!owner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      ms: Date.now() - t0,
      at: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
