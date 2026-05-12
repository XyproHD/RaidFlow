import { NextResponse } from 'next/server';
import { requireGuildMasterOrForbid } from '@/lib/guild-master';
import { syncGuildMemberDiscordDisplayNames } from '@/lib/guild-discord-display-name-sync';

/**
 * POST /api/guilds/[guildId]/members/sync-discord-names
 * Gildenmeister: für alle RaidFlow-Mitglieder der Gilde Discord-Anzeigenamen laden und in rf_character speichern.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ guildId: string }> }
) {
  const { guildId } = await params;
  const auth = await requireGuildMasterOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  const result = await syncGuildMemberDiscordDisplayNames(guildId);

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
