export type RaidEmbedLocale = 'de' | 'en';

export type RaidEmbedStrings = {
  intlLocale: string;
  timeSuffix: string;
  guestTag: string;
  roleLabels: Record<'Tank' | 'Melee' | 'Range' | 'Healer' | '?', string>;
  status: {
    cancelled: string;
    locked: string;
    announced: string;
    open: string;
  };
  fields: {
    schedule: string;
    signupUntil: string;
    status: string;
    slots: string;
    roles: string;
    classes: string;
    signups: string;
    noSignups: string;
    reserve: string;
    noReserve: string;
    notPublic: string;
    reserveNotPublic: string;
    signupsHiddenWithReserve: (n: number) => string;
    slotsPerRaid: (players: number, total: number, perRaid: number) => string;
    raidLeader: string;
    lootMaster: string;
    roster: string;
    noRosterPlayers: string;
    empty: string;
    continuation: (n: number) => string;
    restInRaidFlow: string;
    links: {
      dashboard: string;
      viewRaid: string;
      planner: string;
      coffee: string;
    };
  };
};

const DE: RaidEmbedStrings = {
  intlLocale: 'de-DE',
  timeSuffix: ' Uhr',
  guestTag: ' (Gast)',
  roleLabels: {
    Tank: 'Tanks',
    Melee: 'Nahkampf',
    Range: 'Fernkampf',
    Healer: 'Heiler',
    '?': 'Unbekannt',
  },
  status: {
    cancelled: 'Abgesagt',
    locked: 'Abgeschlossen',
    announced: 'Angekündigt',
    open: 'Offen',
  },
  fields: {
    schedule: 'Termin',
    signupUntil: 'Anmeldung bis',
    status: 'Status',
    slots: 'Plätze',
    roles: 'Rollen',
    classes: '**Klassen**',
    signups: '📋 Anmeldungen',
    noSignups: '_Keine Spieler angemeldet._',
    reserve: 'Reserve',
    noReserve: '*Keine Reserve*',
    notPublic: '*Anmeldungen nicht öffentlich*',
    reserveNotPublic: '*nicht öffentlich*',
    signupsHiddenWithReserve: (n) =>
      `*Anmeldungen nicht öffentlich · ${n} in der Reserve-Reihenfolge*`,
    slotsPerRaid: (players, total, perRaid) =>
      `${players} / ${total} (${perRaid} je Raid)`,
    raidLeader: 'Raidleader',
    lootMaster: 'Lootmeister',
    roster: 'Kader',
    noRosterPlayers: '*Keine Spieler im Kader.*',
    empty: '*leer*',
    continuation: (n) => ` · Fortsetzung ${n}`,
    restInRaidFlow: '\n*… Rest in RaidFlow.*',
    links: {
      dashboard: 'Dashboard',
      viewRaid: 'Raid ansehen',
      planner: 'Planer',
      coffee: 'Kaffeespende',
    },
  },
};

const EN: RaidEmbedStrings = {
  intlLocale: 'en-GB',
  timeSuffix: '',
  guestTag: ' (Guest)',
  roleLabels: {
    Tank: 'Tanks',
    Melee: 'Melee',
    Range: 'Ranged',
    Healer: 'Healers',
    '?': 'Unknown',
  },
  status: {
    cancelled: 'Cancelled',
    locked: 'Locked',
    announced: 'Announced',
    open: 'Open',
  },
  fields: {
    schedule: 'Schedule',
    signupUntil: 'Sign-up until',
    status: 'Status',
    slots: 'Slots',
    roles: 'Roles',
    classes: '**Classes**',
    signups: '📋 Sign-ups',
    noSignups: '_No players signed up._',
    reserve: 'Reserve',
    noReserve: '*No reserve*',
    notPublic: '*Sign-ups not public*',
    reserveNotPublic: '*not public*',
    signupsHiddenWithReserve: (n) =>
      `*Sign-ups not public · ${n} on reserve list*`,
    slotsPerRaid: (players, total, perRaid) =>
      `${players} / ${total} (${perRaid} per raid)`,
    raidLeader: 'Raid leader',
    lootMaster: 'Loot master',
    roster: 'Roster',
    noRosterPlayers: '*No players on roster.*',
    empty: '*empty*',
    continuation: (n) => ` · continued ${n}`,
    restInRaidFlow: '\n*… more in RaidFlow.*',
    links: {
      dashboard: 'Dashboard',
      viewRaid: 'View raid',
      planner: 'Planner',
      coffee: 'Buy us a coffee',
    },
  },
};

export function getRaidEmbedStrings(locale?: string): RaidEmbedStrings {
  return locale === 'en' ? EN : DE;
}

export function normalizeRaidEmbedLocale(locale?: string): RaidEmbedLocale {
  return locale === 'en' ? 'en' : 'de';
}
