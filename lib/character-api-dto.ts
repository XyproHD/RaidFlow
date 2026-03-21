import { getSpecByDisplayName } from '@/lib/wow-tbc-classes';

type CharacterWithGuildAndBnet = {
  id: string;
  name: string;
  guildId: string | null;
  mainSpec: string;
  offSpec: string | null;
  isMain: boolean;
  guildDiscordDisplayName: string | null;
  guild: { id: string; name: string } | null;
  battlenetProfile: { battlenetCharacterId: bigint | null; realmSlug: string } | null;
};

export function characterToClientDto(c: CharacterWithGuildAndBnet) {
  const specInfo = getSpecByDisplayName(c.mainSpec);
  return {
    id: c.id,
    name: c.name,
    guildId: c.guildId,
    guildName: c.guild?.name ?? null,
    guildDiscordDisplayName: c.guildDiscordDisplayName,
    mainSpec: c.mainSpec,
    offSpec: c.offSpec,
    isMain: c.isMain,
    classId: specInfo?.classId ?? null,
    hasBattlenet: !!c.battlenetProfile?.battlenetCharacterId,
    battlenetRealmSlug: c.battlenetProfile?.realmSlug ?? null,
  };
}
