import { headers } from 'next/headers';
import { getToken } from 'next-auth/jwt';

/**
 * Discord User Access Token aus dem NextAuth-JWT (nur Server).
 * Wird für GET /users/@me/guilds/{guild.id}/member benötigt (Scope guilds.members.read).
 */
export async function getDiscordAccessTokenFromJwt(): Promise<string | null> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  try {
    const cookie = headers().get('cookie');
    if (!cookie) return null;
    const token = await getToken({
      req: { headers: { cookie } } as never,
      secret,
    });
    const raw =
      token && typeof token === 'object' && 'discordAccessToken' in token
        ? (token as { discordAccessToken?: unknown }).discordAccessToken
        : null;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}
