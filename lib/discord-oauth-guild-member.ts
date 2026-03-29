import { discordDisplayNameFromGuildMemberPayload } from '@/lib/discord-roles';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

export type OAuthGuildMemberResult = {
  membershipKnown: boolean;
  inGuild: boolean;
  roleIds: string[];
  displayNameInGuild: string | null;
  httpStatus?: number;
};

/**
 * Eigene Member-Daten auf einem Server per User-OAuth (Bearer).
 * Benötigt Scope `guilds.members.read` beim Login.
 */
export async function getSelfGuildMemberViaUserToken(
  userAccessToken: string,
  discordGuildId: string
): Promise<OAuthGuildMemberResult> {
  const unknown: OAuthGuildMemberResult = {
    membershipKnown: false,
    inGuild: false,
    roleIds: [],
    displayNameInGuild: null,
  };
  try {
    const res = await fetch(
      `${DISCORD_API_BASE}/users/@me/guilds/${encodeURIComponent(discordGuildId)}/member`,
      {
        headers: { Authorization: `Bearer ${userAccessToken}` },
        signal:
          typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
            ? AbortSignal.timeout(10000)
            : undefined,
      }
    );
    if (res.status === 404) {
      return {
        membershipKnown: true,
        inGuild: false,
        roleIds: [],
        displayNameInGuild: null,
        httpStatus: 404,
      };
    }
    if (!res.ok) {
      return { ...unknown, httpStatus: res.status };
    }
    const data = (await res.json()) as { roles?: unknown };
    const roleIds = Array.isArray(data.roles)
      ? data.roles.filter((x): x is string => typeof x === 'string' && x.length > 0)
      : [];
    const displayNameInGuild = discordDisplayNameFromGuildMemberPayload(data);
    return {
      membershipKnown: true,
      inGuild: true,
      roleIds,
      displayNameInGuild,
      httpStatus: 200,
    };
  } catch {
    return unknown;
  }
}
