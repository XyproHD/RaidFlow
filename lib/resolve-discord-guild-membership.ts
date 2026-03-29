import { getMemberRoleIds } from '@/lib/discord-roles';
import { getDiscordAccessTokenFromJwt } from '@/lib/discord-jwt-access-token';
import { getSelfGuildMemberViaUserToken } from '@/lib/discord-oauth-guild-member';

export type ResolvedGuildMembership = {
  roleIds: string[];
  inGuild: boolean;
  displayNameInGuild: string | null;
  membershipKnown: boolean;
};

/**
 * Zuerst Bot GET /guilds/.../members/... (DISCORD_BOT_TOKEN), bei unbekanntem Ergebnis
 * Fallback: User-Bearer GET /users/@me/guilds/.../member (Scope guilds.members.read).
 * So funktioniert das Dashboard auch ohne „Server Members Intent“ für den Bot.
 */
export async function resolveDiscordGuildMembership(
  discordGuildId: string,
  effectiveDiscordUserId: string
): Promise<ResolvedGuildMembership> {
  const hasBot = Boolean(process.env.DISCORD_BOT_TOKEN?.trim());
  if (hasBot) {
    try {
      const r = await getMemberRoleIds(discordGuildId, effectiveDiscordUserId);
      if (r.membershipKnown) {
        return {
          roleIds: r.roleIds,
          inGuild: r.inGuild,
          displayNameInGuild: r.displayNameInGuild,
          membershipKnown: true,
        };
      }
    } catch (e) {
      console.error('[resolveDiscordGuildMembership] bot', discordGuildId, e);
    }
  }

  const userToken = await getDiscordAccessTokenFromJwt();
  if (userToken) {
    const o = await getSelfGuildMemberViaUserToken(userToken, discordGuildId);
    if (o.membershipKnown) {
      if (o.httpStatus != null && o.httpStatus !== 200 && o.httpStatus !== 404) {
        console.warn(
          JSON.stringify({
            scope: 'resolveDiscordGuildMembership',
            source: 'oauth',
            discordGuildId,
            httpStatus: o.httpStatus,
            hint:
              o.httpStatus === 401
                ? 'Discord-User-Token abgelaufen — bitte erneut anmelden.'
                : o.httpStatus === 403
                  ? 'Scope guilds.members.read fehlt — einmal abmelden und mit Discord wieder anmelden.'
                  : 'OAuth guild member endpoint',
          })
        );
      }
      return {
        roleIds: o.roleIds,
        inGuild: o.inGuild,
        displayNameInGuild: o.displayNameInGuild,
        membershipKnown: true,
      };
    }
  }

  return {
    roleIds: [],
    inGuild: false,
    displayNameInGuild: null,
    membershipKnown: false,
  };
}
