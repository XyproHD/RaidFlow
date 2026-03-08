import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const ADMINISTRATOR = 0x8;
const MANAGE_GUILD = 0x20;

/**
 * GET /api/discord/my-guilds
 * Gibt die Discord-Server zurück, auf denen der User Owner oder Manager ist
 * (ADMINISTRATOR oder MANAGE_GUILD). Für Bot-Einladung: nur diese Server anzeigen.
 * Erfordert Discord OAuth Scope "guilds" und access_token im JWT.
 */
export async function GET(request: NextRequest) {
  const token = await getToken({ req: request });
  if (!token?.discordAccessToken) {
    return NextResponse.json({ guilds: [] });
  }

  const res = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${token.discordAccessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[discord my-guilds]', res.status, text);
    return NextResponse.json({ guilds: [] });
  }

  const guilds = (await res.json()) as Array<{
    id: string;
    name: string;
    icon: string | null;
    owner: boolean;
    permissions: string;
  }>;

  const canManage = guilds.filter((g) => {
    if (g.owner) return true;
    const perms = parseInt(g.permissions, 10);
    if (Number.isNaN(perms)) return false;
    return (perms & ADMINISTRATOR) === ADMINISTRATOR || (perms & MANAGE_GUILD) === MANAGE_GUILD;
  });

  return NextResponse.json({
    guilds: canManage.map((g) => ({ id: g.id, name: g.name })),
  });
}
