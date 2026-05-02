/**
 * Baut den Discord-Embed und die Action-Buttons für Raid-Posts.
 * Wird beim Erstellen und bei jedem Update des Raids aufgerufen.
 */
import { roleFromSpecDisplayName } from '@/lib/spec-to-role';
import {
  getSpecEmoji,
  getClassEmoji,
  getRoleEmoji,
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
// Rollen-Definitionen (Reihenfolge für Zusammenfassung + Spielerliste)
// ---------------------------------------------------------------------------
const ROLE_DEFS = [
  { key: 'Tank',   label: 'Tanks'    },
  { key: 'Melee',  label: 'Nahkampf' },
  { key: 'Range',  label: 'Fernkampf'},
  { key: 'Healer', label: 'Heiler'   },
] as const;


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
  /** on_time | tight | late */
  punctuality?: string | null;
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
  /** Rollen-Mindestvorgaben – 0 = keine Vorgabe */
  minTanks?: number;
  minMelee?: number;
  minRange?: number;
  minHealers?: number;
  signupVisibility: string;
  signups: RaidEmbedSignup[];
  announcedGroupsJson?: unknown;
  discordEmojis?: Record<string, string>;
  /** Öffentliche Raid-Notiz (rf_raid.note), nicht Planer-HTML */
  publicNote?: string | null;
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

/**
 * Pünktlichkeits-Icon am Zeilenende der Spielerzeile.
 * on_time → kein Icon (Default, kein Rauschen)
 * tight   → ⏳  (wird knapp)
 * late    → 🕐  (kommt später)
 */
function punctualityIcon(p: string | null | undefined): string {
  if (p === 'tight') return ' ⏳';
  if (p === 'late')  return ' 🕐';
  return '';
}

/** Spieler-Zeile: {KlasseEmoji}{SpecEmoji} Charname *(T)* {PuncIcon} */
function playerLine(s: RaidEmbedSignup, emojis: Record<string, string>): string {
  const spec       = s.signedSpec?.trim() || s.mainSpec?.trim() || '?';
  const charName   = s.characterName || '?';
  const twink      = s.isMain === false ? ' *(T)*' : '';
  const punc       = punctualityIcon(s.punctuality);
  const classEmoji = getClassEmoji(spec, emojis);
  const specEmoji  = getSpecEmoji(spec, emojis);
  const emojiPart  = [classEmoji, specEmoji].filter(Boolean).join('');
  return `${emojiPart}${emojiPart ? ' ' : ''}${charName}${twink}${punc}`;
}

function parseStoredGroups(json: unknown): StoredAnnouncedGroups | null {
  if (!json || typeof json !== 'object') return null;
  const d = json as Record<string, unknown>;
  if (!Array.isArray(d.groups)) return null;
  return {
    groups: d.groups as AnnouncedGroupPayload[],
    reserveOrder: Array.isArray(d.reserveOrder) ? d.reserveOrder as string[] : [],
  };
}

/** Raid-Notiz fürs Embed: HTML-Artefakte entfernen, Länge begrenzen. */
function plainTextForDiscord(raw: string, maxLen: number): string {
  let t = raw
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
  if (t.length > maxLen) t = `${t.slice(0, maxLen - 1)}…`;
  return t;
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
// Zusammenfassungs-Helfer
// ---------------------------------------------------------------------------

/**
 * Rollen-Zusammenfassung mit Server-Icons (bzw. Unicode-Fallback).
 * Mindestvorgabe nicht erfüllt → **count/min** (fett), sonst nur count.
 */
function roleSummaryLine(
  byRole: Record<string, RaidEmbedSignup[]>,
  mins:   { Tank: number; Melee: number; Range: number; Healer: number },
  emojis: Record<string, string>,
): string {
  const parts = ROLE_DEFS.map(({ key }) => {
    const count = byRole[key]?.length ?? 0;
    const min   = mins[key as keyof typeof mins] ?? 0;
    const emoji = getRoleEmoji(key, emojis);
    if (min > 0 && count < min) {
      return `${emoji} **${count}/${min}**`;
    }
    return `${emoji} ${count}`;
  });
  return parts.join('  ');
}

/**
 * Klassen-Zusammenfassung — gleiche Optik wie Rollen-Zeile.
 * Trenner ` · ` zwischen Einträgen, nach je 5 Klassen Zeilenumbruch.
 * Nur ausgegeben wenn Custom-Server-Emojis konfiguriert sind.
 */
function classCountLine(
  signups: RaidEmbedSignup[],
  emojis: Record<string, string>
): string {
  const counts = new Map<string, number>();
  for (const s of signups) {
    const spec = s.signedSpec?.trim() || s.mainSpec?.trim() || '';
    const cls  = getClassEmoji(spec, emojis);
    if (!cls) continue;
    counts.set(cls, (counts.get(cls) ?? 0) + 1);
  }
  if (counts.size === 0) return '';

  const COLS = 5;
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const rows: string[] = [];
  for (let i = 0; i < entries.length; i += COLS) {
    rows.push(
      entries.slice(i, i + COLS)
        .map(([emoji, n]) => `${emoji} ${n}`)
        .join('  ·  ')
    );
  }
  return rows.join('\n');
}

/**
 * Kompakte Rollen-Verteilung für eine einzelne Gruppe (Unicode-Emojis).
 */
function groupRoleSummaryLine(
  signupIds: string[],
  signupById: Map<string, RaidEmbedSignup>,
  emojis: Record<string, string>
): string {
  const counts: Record<string, number> = { Tank: 0, Melee: 0, Range: 0, Healer: 0 };
  for (const id of signupIds) {
    const s = signupById.get(id);
    if (!s) continue;
    const spec = s.signedSpec?.trim() || s.mainSpec?.trim();
    const role = spec ? roleFromSpecDisplayName(spec) : null;
    if (role && role in counts) counts[role]++;
  }
  return ROLE_DEFS
    .map(({ key }) => `${getRoleEmoji(key, emojis)} ${counts[key]}`)
    .join('  ');
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

  const minTanks   = input.minTanks   ?? 0;
  const minMelee   = input.minMelee   ?? 0;
  const minRange   = input.minRange   ?? 0;
  const minHealers = input.minHealers ?? 0;

  const isAnnounced = status === 'announced' || status === 'locked';
  const isRevealed  = signupVisibility === 'public' || isAnnounced;

  const announcedGroups = parseStoredGroups(announcedGroupsJson);

  // --- Basisdaten ---
  const title = `⚔️ ${raidName} — ${dungeonNames.join(' + ')}`.slice(0, 256);
  const color = embedColor(status, signupUntil);

  const base    = appUrl.replace(/\/$/, '');
  const dashUrl = `${base}/${locale}/dashboard`;
  const raidUrl = `${base}/${locale}/guild/${guildId}/raid/${raidId}`;
  const planUrl = `${base}/${locale}/guild/${guildId}/raid/${raidId}/plan`;
  const linksMarkdown = `[Dashboard](${dashUrl}) · [Raid ansehen](${raidUrl}) · [Planer](${planUrl})`;

  const publicNotePlain = input.publicNote?.trim()
    ? plainTextForDiscord(input.publicNote.trim(), 3900)
    : '';
  const description = publicNotePlain
    ? `ℹ️ ${publicNotePlain}`.slice(0, 4096)
    : undefined;

  // Zählung & Rollen-Verteilung (früh berechnet, für Zusammenfassung + Spielerliste)
  const mainSignups    = signups.filter(s => s.type !== 'reserve' && s.type !== 'declined');
  const reserveSignups = signups.filter(s => s.type === 'reserve');
  const uniquePlayers  = new Set(mainSignups.map(s => s.userId)).size;

  const groupCount = announcedGroups?.groups.length ?? 1;
  const totalMax   = maxPlayers * groupCount;
  const anmeldungenValue = groupCount > 1
    ? `${uniquePlayers} / ${totalMax} (${maxPlayers} je Gruppe)`
    : `${uniquePlayers} / ${maxPlayers}`;

  const byRole: Record<string, RaidEmbedSignup[]> = { Tank: [], Melee: [], Range: [], Healer: [], '?': [] };
  for (const s of mainSignups) {
    const spec = s.signedSpec?.trim() || s.mainSpec?.trim();
    const role = spec ? roleFromSpecDisplayName(spec) : null;
    (byRole[role ?? '?'] ??= []).push(s);
  }

  // --- Stammdaten: zwei parallele Inline-Felder ---
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

  const fields: NonNullable<DiscordEmbed['fields']> = [
    { name: '\u200b', value: labelCol, inline: true },
    { name: '\u200b', value: valueCol, inline: true },
  ];

  // --- Zusammenfassung je Rolle (ANSI) + Klasse (wenn Anmeldungen sichtbar) ---
  if (isRevealed && mainSignups.length > 0) {
    const mins      = { Tank: minTanks, Melee: minMelee, Range: minRange, Healer: minHealers };
    const roleLine  = roleSummaryLine(byRole, mins, discordEmojis);
    const classLine = classCountLine(mainSignups, discordEmojis);
    const summaryValue = classLine ? `${roleLine}\n${classLine}` : roleLine;
    fields.push({ name: '\u200b', value: summaryValue, inline: false });
  }

  // Visueller Trenner (leeres Feld = nativer Abstandshalter)
  fields.push({ name: '\u200b', value: '\u200b', inline: false });

  if (isAnnounced && announcedGroups && announcedGroups.groups.length > 0) {
    // -----------------------------------------------------------------------
    // Angekündigt / Abgeschlossen: Gruppen-Ansicht
    // -----------------------------------------------------------------------
    const signupById   = new Map(signups.map(s => [s.id, s]));
    const signupByUser = new Map(signups.map(s => [s.userId, s]));

    for (let gi = 0; gi < announcedGroups.groups.length; gi++) {
      if (gi > 0) {
        fields.push({ name: '\u200b', value: '\u200b', inline: false });
      }

      const group = announcedGroups.groups[gi];
      const lines: string[] = [];

      // Lead/Loot-Header mit Klartext-Labels
      const leadSignup = group.raidLeaderUserId ? signupByUser.get(group.raidLeaderUserId) : null;
      const lootSignup = group.lootmasterUserId ? signupByUser.get(group.lootmasterUserId) : null;
      const headerParts: string[] = [];
      if (leadSignup?.characterName) headerParts.push(`👑 Raidleader: **${leadSignup.characterName}**`);
      if (lootSignup?.characterName) headerParts.push(`💰 Lootmeister: **${lootSignup.characterName}**`);
      if (headerParts.length > 0) {
        lines.push(headerParts.join('  ·  '));
      }

      // Rollen-Verteilung der Gruppe
      lines.push(groupRoleSummaryLine(group.rosterOrder, signupById, discordEmojis));

      // Trenner vor Spielerliste (U+25AC BLACK RECTANGLE)
      lines.push('▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬');

      for (const signupId of group.rosterOrder) {
        const s = signupById.get(signupId);
        if (!s) continue;
        lines.push(playerLine(s, discordEmojis));
      }

      fields.push({
        name:  `Gruppe ${gi + 1}`,
        value: lines.length > 0 ? truncateLines(lines) : '*leer*',
        inline: false,
      });
    }

    // Visueller Trenner (leeres Feld = nativer Abstandshalter)
    fields.push({ name: '\u200b', value: '\u200b', inline: false });
    // Reserve
    
    {
      const signupById2 = new Map(signups.map(s => [s.id, s]));
      const resLines = announcedGroups.reserveOrder
        .map(id => signupById2.get(id))
        .filter((s): s is RaidEmbedSignup => !!s)
        .map(s => playerLine(s, discordEmojis));
      fields.push({
        name:  `Reserve (${resLines.length})`,
        value: resLines.length > 0 ? truncateLines(resLines) : '*Keine Reserve*',
        inline: false,
      });
    }

  } else if (isRevealed && mainSignups.length > 0) {
    // -----------------------------------------------------------------------
    // Offen: Rollen-Ansicht (inline = 2-spaltig für bessere Übersicht)
    // -----------------------------------------------------------------------
    for (const { key, label } of ROLE_DEFS) {
      const group = byRole[key];
      if (!group?.length) continue;
      const roleEmoji = getRoleEmoji(key, discordEmojis);
      fields.push({
        name:  `${roleEmoji} ${label} (${group.length})`.trim(),
        value: truncateLines(group.map(s => playerLine(s, discordEmojis))),
        inline: true,
      });
    }

    if (byRole['?'].length > 0) {
      fields.push({
        name:  `❓ Unbekannte Rolle (${byRole['?'].length})`,
        value: truncateLines(byRole['?'].map(s => playerLine(s, discordEmojis))),
        inline: false,
      });
    }
  // Visueller Trenner (leeres Feld = nativer Abstandshalter)
  fields.push({ name: '\u200b', value: '\u200b', inline: false });

    fields.push({
      name:  `Reserve (${reserveSignups.length})`,
      value: reserveSignups.length > 0
        ? truncateLines(reserveSignups.map(s => playerLine(s, discordEmojis)))
        : '*Keine Reserve*',
      inline: false,
    });

  } else if (!isRevealed) {
    const hint = reserveSignups.length > 0
      ? `*Anmeldungen nicht öffentlich · ${reserveSignups.length} auf Reserve*`
      : '*Anmeldungen nicht öffentlich*';
    fields.push({ name: '\u200b', value: hint, inline: false });
    fields.push({
      name:  `Reserve (${reserveSignups.length})`,
      value: '*nicht öffentlich*',
      inline: false,
    });
  } else {
    fields.push({ name: '\u200b', value: '*Noch keine Anmeldungen.*', inline: false });
    fields.push({ name: 'Reserve (0)', value: '*Keine Reserve*', inline: false });
  }
  // Visueller Trenner (leeres Feld = nativer Abstandshalter)
  fields.push({ name: '\u200b', value: '\u200b', inline: false });

  fields.push({
    name:   '🔗',
    value:  linksMarkdown.slice(0, 1024),
    inline: false,
  });

  return { title, ...(description ? { description } : {}), color, fields };
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
export function buildRaidActionButtons(
  raidId: string,
  guildId: string
): DiscordMessageComponent[] {
  const rid = uuidNoDash(raidId);
  const gid = uuidNoDash(guildId);

  return [
    {
      type: 1,
      components: [
        { type: 2, style: 3, label: 'Quickjoin',  emoji: { name: '⚡' }, custom_id: `rf:qj:${rid}:${gid}` },
        { type: 2, style: 1, label: 'Anmelden',   emoji: { name: '📋' }, custom_id: `rf:join:${rid}:${gid}` },
        { type: 2, style: 2, label: 'Anmelden 2', emoji: { name: '🧪' }, custom_id: `rf:join2:${rid}:${gid}` },
        { type: 2, style: 2, label: 'Bearbeiten', emoji: { name: '✏️' }, custom_id: `rf:edit:${rid}:${gid}` },
        { type: 2, style: 4, label: 'Abmelden',   emoji: { name: '🚪' }, custom_id: `rf:unreg:${rid}:${gid}` },
      ],
    },
    {
      type: 1,
      components: [
        { type: 2, style: 4, label: 'Bin nicht da', emoji: { name: '🚫' }, custom_id: `rf:decl:${rid}:${gid}` },
      ],
    },
  ];
}
