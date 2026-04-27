/**
 * Baut den Discord-Embed und die Action-Buttons für Raid-Posts.
 * Wird beim Erstellen und bei jedem Update des Raids aufgerufen.
 */
import { roleFromSpecDisplayName } from '@/lib/spec-to-role';
import {
  getSpecEmoji,
  getClassEmoji,
  getRoleEmoji,
  ROLE_FALLBACK_EMOJI,
} from '@/lib/discord-wow-emojis';
import type { AnnouncedGroupPayload } from '@/lib/raid-announce';
import type { DiscordEmbed, DiscordMessageComponent } from '@/lib/discord-guild-api';

// ---------------------------------------------------------------------------
// Embed-Farben je Status
// ---------------------------------------------------------------------------
const COLOR = {
  open_signup_open:   0x57F287,
  open_signup_closed: 0xFEE75C,
  announced:          0x5865F2,
  locked:             0xEB459E,
  cancelled:          0xED4245,
} as const;

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------
export type RaidEmbedSignup = {
  id: string;
  userId: string;
  characterName?: string | null;
  mainSpec?: string | null;
  signedSpec?: string | null;
  isMain?: boolean | null;
  leaderPlacement?: string | null;
  isLate?: boolean;
  type: string;
};

export type StoredAnnouncedGroups = {
  groups: AnnouncedGroupPayload[];
  reserveOrder: string[];
};

export type RaidEmbedInput = {
  raidId: string;
  guildId: string;
  raidName: string;
  dungeonNames: string[];
  scheduledAt: Date;
  signupUntil: Date;
  status: string;
  maxPlayers: number;
  signupVisibility: string;
  signups: RaidEmbedSignup[];
  announcedGroupsJson?: unknown;
  discordEmojis?: Record<string, string>;
  appUrl: string;
  locale?: string;
};

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

export function uuidNoDash(uuid: string): string {
  return uuid.replace(/-/g, '');
}

export function noDashToUuid(s: string): string {
  if (s.length !== 32) return s;
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

function formatDE(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', ...opts }).format(date);
}

function formatDate(date: Date): string {
  return formatDE(date, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(date: Date): string {
  return formatDE(date, { hour: '2-digit', minute: '2-digit' });
}

function embedColor(status: string, signupUntil: Date): number {
  if (status === 'cancelled') return COLOR.cancelled;
  if (status === 'locked')    return COLOR.locked;
  if (status === 'announced') return COLOR.announced;
  return new Date() > signupUntil ? COLOR.open_signup_closed : COLOR.open_signup_open;
}

function statusText(status: string, signupUntil: Date): string {
  if (status === 'cancelled') return 'Abgesagt';
  if (status === 'locked')    return 'Abgeschlossen';
  if (status === 'announced') return 'Angekündigt';
  if (new Date() > signupUntil) return 'Offen';
  return 'Offen';
}

/** Spieler-Zeile: <KlasseEmoji><SpecEmoji> Charname (T) */
function playerLine(
  s: RaidEmbedSignup,
  emojis: Record<string, string>,
  prefix = ''
): string {
  const spec       = s.signedSpec?.trim() || s.mainSpec?.trim() || '?';
  const charName   = s.characterName || '?';
  const twink      = s.isMain === false ? ' *(T)*' : '';
  const classEmoji = getClassEmoji(spec, emojis);
  const specEmoji  = getSpecEmoji(spec, emojis);
  const emojiPart  = [classEmoji, specEmoji].filter(Boolean).join('');
  return `${prefix}${emojiPart}${emojiPart ? ' ' : ''}${charName}${twink}`;
}

/** Platzierungs-Prefix für Rollen-Ansicht (offen, noch nicht angekündigt). */
function placementPrefix(
  placement: string | null | undefined,
  showPlacement: boolean
): string {
  if (!showPlacement) return '';
  if (placement === 'confirmed')  return '[G] ';
  if (placement === 'substitute') return '[E] ';
  return '';
}

function parseStoredGroups(json: unknown): StoredAnnouncedGroups | null {
  if (!json || typeof json !== 'object') return null;
  const d = json as Record<string, unknown>;
  if (!Array.isArray(d.groups)) return null;
  return { groups: d.groups as AnnouncedGroupPayload[], reserveOrder: Array.isArray(d.reserveOrder) ? d.reserveOrder as string[] : [] };
}

function truncateLines(lines: string[], maxChars = 1000): string {
  let value = '';
  let count = 0;
  for (const line of lines) {
    const next = value ? `${value}\n${line}` : line;
    if (next.length > maxChars) {
      const remaining = lines.length - count;
      if (remaining > 0) value += `\n*… +${remaining} weitere*`;
      break;
    }
    value = next;
    count++;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Embed-Builder
// ---------------------------------------------------------------------------

export function buildRaidEmbed(input: RaidEmbedInput): DiscordEmbed {
  const {
    raidId, guildId, raidName, dungeonNames, scheduledAt, signupUntil,
    status, maxPlayers, signupVisibility, signups, announcedGroupsJson,
    discordEmojis = {}, appUrl, locale = 'de',
  } = input;

  const showPlacement = status === 'announced' || status === 'locked';
  const isAnnounced  = status === 'announced' || status === 'locked';
  const isRevealed   = signupVisibility === 'public' || isAnnounced;

  // Gruppen-Daten aus announced_planner_groups_json
  const announcedGroups = parseStoredGroups(announcedGroupsJson);

  // --- Basisdaten ---
  const title = `⚔️ ${raidName} — ${dungeonNames.join(' + ')}`.slice(0, 256);
  const color = embedColor(status, signupUntil);

  const base    = appUrl.replace(/\/$/, '');
  const dashUrl = `${base}/${locale}/dashboard`;
  const raidUrl = `${base}/${locale}/guild/${guildId}/raid/${raidId}`;
  const planUrl = `${base}/${locale}/guild/${guildId}/raid/${raidId}/plan`;

  // Zählung: nur non-reserve, non-declined für unique Spieler
  const mainSignups    = signups.filter(s => s.type !== 'reserve' && s.type !== 'declined');
  const reserveSignups = signups.filter(s => s.type === 'reserve');
  const uniquePlayers  = new Set(mainSignups.map(s => s.userId)).size;

  const groupCount = announcedGroups?.groups.length ?? 1;
  const totalMax   = maxPlayers * groupCount;

  const anmeldungenValue = groupCount > 1
    ? `${uniquePlayers} / ${totalMax} (${maxPlayers} je Gruppe)`
    : `${uniquePlayers} / ${maxPlayers}`;

  // --- Description: Links ---
  const description = `[Dashboard](${dashUrl}) · [Raid ansehen](${raidUrl}) · [Planer](${planUrl})`;

  // --- Zwei inline-Felder als tabellarische Stammdaten ---
  const labelCol = [
    '📅 **Termin**',
    '🗓️ **Anmeldung bis**',
    '📊 **Status**',
    '👥 **Plätze**',
  ].join('\n');
  const valueCol = [
    `${formatDate(scheduledAt)} · ${formatTime(scheduledAt)} Uhr`,
    `${formatDate(signupUntil)} · ${formatTime(signupUntil)} Uhr`,
    statusText(status, signupUntil),
    anmeldungenValue,
  ].join('\n');

  // --- Felder: Stammdaten (zwei inline-Spalten) + Separator + Spielerliste ---
  const fields: NonNullable<DiscordEmbed['fields']> = [
    { name: '\u200b', value: labelCol, inline: true  },
    { name: '\u200b', value: valueCol, inline: true  },
    { name: '\u200b', value: '──────────────────────────────', inline: false },
  ];

  if (isAnnounced && announcedGroups && announcedGroups.groups.length > 0) {
    // -----------------------------------------------------------------------
    // Angekündigt: Gruppen-Ansicht
    // -----------------------------------------------------------------------
    const signupById = new Map(signups.map(s => [s.id, s]));
    const signupByUser = new Map(signups.map(s => [s.userId, s]));

    for (let gi = 0; gi < announcedGroups.groups.length; gi++) {
      const group = announcedGroups.groups[gi];
      const lines: string[] = [];

      // Lead/Loot-Header am Anfang des Field-Values
      const leadSignup = group.raidLeaderUserId ? signupByUser.get(group.raidLeaderUserId) : null;
      const lootSignup = group.lootmasterUserId ? signupByUser.get(group.lootmasterUserId) : null;
      const headerParts: string[] = [];
      if (leadSignup?.characterName) headerParts.push(`👑 **${leadSignup.characterName}**`);
      if (lootSignup?.characterName) headerParts.push(`💰 **${lootSignup.characterName}**`);
      if (headerParts.length > 0) {
        lines.push(headerParts.join('  ·  '));
        lines.push('──────────────────────────────');
      }

      for (const signupId of group.rosterOrder) {
        const s = signupById.get(signupId);
        if (!s) continue;
        lines.push(playerLine(s, discordEmojis));
      }

      const fieldName  = `Gruppe ${gi + 1}`;
      const fieldValue = lines.length > 0 ? truncateLines(lines) : '*leer*';

      fields.push({ name: fieldName, value: fieldValue, inline: false });
    }

    // Reserve am Ende – immer anzeigen
    {
      const signupById2 = new Map(signups.map(s => [s.id, s]));
      const resLines = announcedGroups.reserveOrder
        .map(id => signupById2.get(id))
        .filter((s): s is RaidEmbedSignup => !!s)
        .map(s => playerLine(s, discordEmojis));
      fields.push({
        name:   `Reserve (${resLines.length})`,
        value:  resLines.length > 0 ? truncateLines(resLines) : '*Keine Reserve*',
        inline: false,
      });
    }
  } else if (isRevealed && mainSignups.length > 0) {
    // -----------------------------------------------------------------------
    // Offen: Rollen-Ansicht (nur wenn Anmeldungen öffentlich)
    // -----------------------------------------------------------------------
    const byRole: Record<string, RaidEmbedSignup[]> = { Tank: [], Melee: [], Range: [], Healer: [], '?': [] };
    for (const s of mainSignups) {
      const spec = s.signedSpec?.trim() || s.mainSpec?.trim();
      const role = spec ? roleFromSpecDisplayName(spec) : null;
      (byRole[role ?? '?'] ??= []).push(s);
    }

    const roleGroups = [
      { label: 'Tanks',     key: 'Tank'   },
      { label: 'Nahkampf',  key: 'Melee'  },
      { label: 'Fernkampf', key: 'Range'  },
      { label: 'Heiler',    key: 'Healer' },
    ];

    for (const { label, key } of roleGroups) {
      const group = byRole[key];
      if (!group?.length) continue;
      const showPl = showPlacement;
      const lines = group.map(s => {
        const pl = placementPrefix(s.leaderPlacement, showPl);
        return playerLine(s, discordEmojis, pl);
      });
      const roleEmoji = getRoleEmoji(key, discordEmojis);
      fields.push({
        name:   `${roleEmoji} ${label} (${group.length})`.trim(),
        value:  truncateLines(lines),
        inline: false,
      });
    }

    if (byRole['?'].length > 0) {
      const lines = byRole['?'].map(s => playerLine(s, discordEmojis));
      fields.push({ name: `❓ Unbekannte Rolle (${byRole['?'].length})`, value: truncateLines(lines), inline: false });
    }

    // Reserve immer anzeigen
    const resLinesOpen = reserveSignups.map(s => playerLine(s, discordEmojis));
    fields.push({
      name:   `Reserve (${reserveSignups.length})`,
      value:  resLinesOpen.length > 0 ? truncateLines(resLinesOpen) : '*Keine Reserve*',
      inline: false,
    });
  } else if (!isRevealed) {
    const hint = reserveSignups.length > 0
      ? `*Anmeldungen nicht öffentlich · ${reserveSignups.length} auf Reserve*`
      : '*Anmeldungen nicht öffentlich*';
    fields.push({ name: '\u200b', value: hint, inline: false });
    // Reserve zählen, aber nicht auflisten
    fields.push({
      name:   `Reserve (${reserveSignups.length})`,
      value:  '*nicht öffentlich*',
      inline: false,
    });
  } else {
    fields.push({ name: '\u200b', value: '*Noch keine Anmeldungen.*', inline: false });
    fields.push({ name: 'Reserve (0)', value: '*Keine Reserve*', inline: false });
  }

  return { title, description, color, fields };
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
export function buildRaidActionButtons(
  raidId: string,
  guildId: string
): DiscordMessageComponent {
  const rid = uuidNoDash(raidId);
  const gid = uuidNoDash(guildId);

  return {
    type: 1,
    components: [
      { type: 2, style: 3, label: 'Quickjoin',  emoji: { name: '⚡' },  custom_id: `rf:qj:${rid}:${gid}` },
      { type: 2, style: 1, label: 'Anmelden',   emoji: { name: '📋' }, custom_id: `rf:join:${rid}:${gid}` },
      { type: 2, style: 2, label: 'Bearbeiten', emoji: { name: '✏️' }, custom_id: `rf:edit:${rid}:${gid}` },
      { type: 2, style: 4, label: 'Abmelden',   emoji: { name: '🚪' }, custom_id: `rf:unreg:${rid}:${gid}` },
    ],
  };
}
