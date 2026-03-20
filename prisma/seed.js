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
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
