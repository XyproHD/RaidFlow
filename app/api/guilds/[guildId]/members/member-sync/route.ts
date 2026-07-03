import { NextResponse } from 'next/server';
import { requireGuildMasterOrForbid } from '@/lib/guild-master';
import { syncGuildMembers } from '@/lib/guild-member-sync';

/**
 * POST /api/guilds/[guildId]/members/member-sync
 * Gildenmeister: Mitgliederliste mit dem Discord-Server abgleichen.
 * Entfernt Mitglieder, die nicht mehr auf dem Server sind, keine Gilden-Rolle
 * oder keinen Charakter in dieser Gilde haben. Für verbleibende Mitglieder werden
 * Rollen und Anzeigenamen aktualisiert.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ guildId: string }> }
) {
  const { guildId } = await params;
  const auth = await requireGuildMasterOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  const result = await syncGuildMembers(guildId, auth.userId);

  if (!result.botTokenConfigured) {
    return NextResponse.json(
      {
        error: 'Discord bot token not configured',
        detail: 'DISCORD_BOT_TOKEN is missing on the server.',
        result,
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, result });
}
