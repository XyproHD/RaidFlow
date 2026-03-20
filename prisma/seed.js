/**
 * RaidFlow DB-Seed: TBC-Dungeons (Phase 3.5).
 * Ausführung: npx prisma db seed
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TBC_DUNGEONS = [
  { name: 'Karazhan', expansion: 'TBC' },
  { name: "Gruul's Lair", expansion: 'TBC' },
  { name: "Magtheridon's Lair", expansion: 'TBC' },
  { name: 'Serpentshrine Cavern', expansion: 'TBC' },
  { name: 'Tempest Keep', expansion: 'TBC' },
  { name: 'Hyjal Summit', expansion: 'TBC' },
  { name: 'Black Temple', expansion: 'TBC' },
  { name: "Zul'Aman", expansion: 'TBC' },
  { name: 'Sunwell Plateau', expansion: 'TBC' },
];

async function main() {
  const existing = await prisma.rfDungeon.findMany({ select: { name: true } });
  const existingNames = new Set(existing.map((e) => e.name));
  for (const d of TBC_DUNGEONS) {
    if (existingNames.has(d.name)) continue;
    await prisma.rfDungeon.create({
      data: {
        name: d.name,
        expansion: d.expansion,
        instanceType: 'raid',
        maxPlayers: 25,
      },
    });
  }
  console.log('Seed: TBC-Dungeons angelegt/geprüft.');

  const battlenetClientId = process.env.BATTLENET_CLIENT_ID;
  const battlenetClientSecret = process.env.BATTLENET_CLIENT_SECRET;

  if (!battlenetClientId || !battlenetClientSecret) {
    console.warn('Seed: Battle.net Konfiguration übersprungen (BATTLENET_CLIENT_ID/SECRET fehlt).');
    return;
  }

  await prisma.rfBattlenetApiConfig.upsert({
    where: { region: 'eu' },
    update: {
      clientId: battlenetClientId,
      clientSecret: battlenetClientSecret,
      locale: 'de_DE',
      namespaceProfile: 'profile-classic-eu',
      namespaceDynamic: 'dynamic-classic-eu',
      oauthTokenUrl: 'https://oauth.battle.net/token',
      apiBaseUrl: 'https://eu.api.blizzard.com',
      searchCharacterPath: '/data/wow/search/character',
      searchGuildPath: '/data/wow/search/guild',
      profileCharacterPath: '/profile/wow/character',
      profileGuildPath: '/data/wow/guild',
      isActive: true,
    },
    create: {
      region: 'eu',
      clientId: battlenetClientId,
      clientSecret: battlenetClientSecret,
      locale: 'de_DE',
      namespaceProfile: 'profile-classic-eu',
      namespaceDynamic: 'dynamic-classic-eu',
      oauthTokenUrl: 'https://oauth.battle.net/token',
      apiBaseUrl: 'https://eu.api.blizzard.com',
      searchCharacterPath: '/data/wow/search/character',
      searchGuildPath: '/data/wow/search/guild',
      profileCharacterPath: '/profile/wow/character',
      profileGuildPath: '/data/wow/guild',
      isActive: true,
    },
  });

  console.log('Seed: Battle.net API Konfiguration (Region EU) angelegt/geprüft.');

  // ---------------------------------------------------------------------------
  // Battle.net Realms (fixed server list)
  // ---------------------------------------------------------------------------

  const existingRealmsCount = await prisma.rfBattlenetRealm.count();
  if (existingRealmsCount > 0) {
    console.log(`Seed: Battle.net Realms vorhanden (${existingRealmsCount}) - ergänze fehlende Einträge aus fester Liste.`);
  }

  const FIXED_REALMS = [
    // EU - WoW Classic (Era / Hardcore / SoD)
    { region: 'eu', wowVersion: 'classic_era', realmSlug: 'everlook', realmName: 'Everlook' },
    { region: 'eu', wowVersion: 'classic_era', realmSlug: 'lakeshire', realmName: 'Lakeshire' },
    { region: 'eu', wowVersion: 'classic_era', realmSlug: 'pyrewood-village', realmName: 'Pyrewood Village' },
    { region: 'eu', wowVersion: 'classic_era', realmSlug: 'hydraxian-waterlords', realmName: 'Hydraxian Waterlords' },
    { region: 'eu', wowVersion: 'hardcore', realmSlug: 'stitches', realmName: 'Stitches' },
    { region: 'eu', wowVersion: 'hardcore', realmSlug: 'nekrosh', realmName: "Nek'Rosh" },
    { region: 'eu', wowVersion: 'season_of_discovery', realmSlug: 'lone-wolf', realmName: 'Lone Wolf' },
    { region: 'eu', wowVersion: 'season_of_discovery', realmSlug: 'living-flame', realmName: 'Living Flame' },

    // EU - Jubilaeum von Burning Crusade
    { region: 'eu', wowVersion: 'anniversary', realmSlug: 'thunderstrike', realmName: 'Thunderstrike' },

    // EU - MoP/TBC progression bucket
    { region: 'eu', wowVersion: 'progression', realmSlug: 'firemaw', realmName: 'Firemaw' },
    { region: 'eu', wowVersion: 'progression', realmSlug: 'gehennas', realmName: 'Gehennas' },
    { region: 'eu', wowVersion: 'progression', realmSlug: 'mograine', realmName: 'Mograine' },
    { region: 'eu', wowVersion: 'progression', realmSlug: 'venoxis', realmName: 'Venoxis' },

    // US
    { region: 'us', wowVersion: 'classic_era', realmSlug: 'whitemane', realmName: 'Whitemane' },
    { region: 'us', wowVersion: 'classic_era', realmSlug: 'mankrik', realmName: 'Mankrik' },
    { region: 'us', wowVersion: 'classic_era', realmSlug: 'pagle', realmName: 'Pagle' },
    { region: 'us', wowVersion: 'hardcore', realmSlug: 'defias-pillager', realmName: 'Defias Pillager' },
    { region: 'us', wowVersion: 'hardcore', realmSlug: 'skull-rock', realmName: 'Skull Rock' },
    { region: 'us', wowVersion: 'season_of_discovery', realmSlug: 'crusader-strike', realmName: 'Crusader Strike' },
    { region: 'us', wowVersion: 'season_of_discovery', realmSlug: 'lava-lash', realmName: 'Lava Lash' },
    { region: 'us', wowVersion: 'progression', realmSlug: 'faerlina', realmName: 'Faerlina' },
    { region: 'us', wowVersion: 'progression', realmSlug: 'benediction', realmName: 'Benediction' },
    { region: 'us', wowVersion: 'progression', realmSlug: 'grobbulus', realmName: 'Grobbulus' },

    // KR / TW (small fixed baseline)
    { region: 'kr', wowVersion: 'progression', realmSlug: 'iceblood', realmName: 'Iceblood' },
    { region: 'kr', wowVersion: 'season_of_discovery', realmSlug: 'shimmering-flats', realmName: 'Shimmering Flats' },
    { region: 'kr', wowVersion: 'hardcore', realmSlug: 'makgora', realmName: 'Makgora' },
    { region: 'tw', wowVersion: 'progression', realmSlug: 'arugal', realmName: 'Arugal' },
    { region: 'tw', wowVersion: 'classic_era', realmSlug: 'remulos', realmName: 'Remulos' },
    { region: 'tw', wowVersion: 'season_of_discovery', realmSlug: 'shadowstrike', realmName: 'Shadowstrike' },
    { region: 'tw', wowVersion: 'hardcore', realmSlug: 'soulseeker', realmName: 'Soulseeker' },
  ];

  const chunk = (arr, size) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  console.log('Seed: Battle.net Realms werden als feste Liste geladen…');
  for (const part of chunk(FIXED_REALMS, 5000)) {
    await prisma.rfBattlenetRealm.createMany({
      data: part,
      skipDuplicates: true,
    });
  }
  console.log(`Seed: Battle.net Realms Tabelle befüllt (${FIXED_REALMS.length} Einträge geprüft).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
