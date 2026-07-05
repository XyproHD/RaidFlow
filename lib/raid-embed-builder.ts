/**
 * Baut den Discord-Embed und die Action-Buttons für Raid-Posts.
 * Wird beim Erstellen und bei jedem Update des Raids aufgerufen.
 */
import { roleFromSpecDisplayName } from '@/lib/spec-to-role';
import {
  getSpecEmoji,
  getClassEmojiByClassId,
  getRoleEmoji,
} from '@/lib/discord-wow-emojis';
import { TBC_CLASSES, getSpecByDisplayName } from '@/lib/wow-tbc-classes';
import type { AnnouncedGroupPayload } from '@/lib/raid-announce';
import { PLANNER_PARTY_SIZE } from '@/lib/planner-party-slots';
import {
  filterSignupsByPublicBucket,
  isPublishedRaidStatus,
  orderedPublicReserveIds,
  signupsForPublicRoleCounts,
  type RaidDisplayContext,
} from '@/lib/raid-signup-display';
import type { DiscordEmbed, DiscordMessageComponent } from '@/lib/discord-guild-api';
import { KOFI_URL } from '@/lib/support-links';
import { getRaidEmbedStrings, type RaidEmbedStrings } from '@/lib/raid-embed-i18n';

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
const ROLE_KEYS = ['Tank', 'Melee', 'Range', 'Healer'] as const;


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
  originalSignupType?: string | null;
  setConfirmed?: boolean;
  isGuest?: boolean;
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
  /** Reserve-Reihenfolge aus rf_raid.draft_planner_groups_json (nur bei nicht angekündigtem Raid). */
  draftPlannerReserveOrder?: string[] | null;
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

function formatLocaleDate(date: Date, intlLocale: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(intlLocale, { timeZone: 'Europe/Berlin', ...opts }).format(date);
}

function formatDate(date: Date, strings: RaidEmbedStrings): string {
  return formatLocaleDate(date, strings.intlLocale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatTime(date: Date, strings: RaidEmbedStrings): string {
  return formatLocaleDate(date, strings.intlLocale, { hour: '2-digit', minute: '2-digit' });
}

function embedColor(status: string, signupUntil: Date): number {
  if (status === 'cancelled') return COLOR.cancelled;
  if (status === 'locked')    return COLOR.locked;
  if (status === 'announced') return COLOR.announced;
  return new Date() > signupUntil ? COLOR.open_signup_closed : COLOR.open_signup_open;
}

function statusText(status: string, signupUntil: Date, strings: RaidEmbedStrings): string {
  if (status === 'cancelled') return strings.status.cancelled;
  if (status === 'locked') return strings.status.locked;
  if (status === 'announced') return strings.status.announced;
  if (new Date() > signupUntil) return strings.status.open;
  return strings.status.open;
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

function embedCharacterLabel(
  s: RaidEmbedSignup | null | undefined,
  guestTag: string
): string | null {
  if (!s?.characterName) return null;
  return `${s.characterName}${s.isGuest ? guestTag : ''}`;
}

function playerLine(s: RaidEmbedSignup, emojis: Record<string, string>, guestTag: string): string {
  const spec = s.signedSpec?.trim() || s.mainSpec?.trim() || '?';
  const charName = `${s.characterName || '?'}${s.isGuest ? guestTag : ''}`;
  const twink = s.isMain === false ? ' *(T)*' : '';
  const punc = punctualityIcon(s.punctuality);
  const emojiPart = getSpecEmoji(spec, emojis);
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

const DISCORD_EMBED_MAX_FIELDS = 25;
const DISCORD_EMBED_MAX_COUNT = 10;
const DISCORD_FIELD_VALUE_SAFE = 1010;

/** Verteilt Embed-Felder auf mehrere Embeds bei Discord-Limits (25 Felder, max. 10 Embeds pro Nachricht). */
class RaidEmbedFieldPacker {
  readonly embeds: DiscordEmbed[] = [];
  private readonly strings: RaidEmbedStrings;

  constructor(
    first: Pick<DiscordEmbed, 'title' | 'description' | 'color'>,
    strings: RaidEmbedStrings
  ) {
    this.strings = strings;
    this.embeds.push({
      title: first.title,
      ...(first.description ? { description: first.description } : {}),
      color: first.color,
      fields: [],
    });
  }

  push(field: { name: string; value: string; inline?: boolean }): void {
    let last = this.embeds[this.embeds.length - 1]!;
    let fields = last.fields ?? [];

    if (fields.length >= DISCORD_EMBED_MAX_FIELDS) {
      if (this.embeds.length >= DISCORD_EMBED_MAX_COUNT) {
        const tail = this.strings.fields.restInRaidFlow;
        const lf = fields[fields.length - 1];
        if (lf && !lf.value.includes('RaidFlow')) {
          lf.value = `${lf.value}${tail}`.slice(0, 1024);
        }
        return;
      }
      const seedTitle = this.embeds[0].title ?? 'Raid';
      const nextTitle = `${String(seedTitle).slice(0, 200)}${this.strings.fields.continuation(this.embeds.length + 1)}`.slice(
        0,
        256
      );
      this.embeds.push({
        title: nextTitle,
        color: this.embeds[0].color,
        fields: [],
      });
      last = this.embeds[this.embeds.length - 1]!;
      fields = last.fields ?? [];
    }

    fields.push({
      name: field.name.slice(0, 256),
      value: field.value.slice(0, 1024),
      ...(field.inline !== undefined ? { inline: field.inline } : {}),
    });
    last.fields = fields;
  }

  finalizeLinks(linksMarkdown: string): void {
    this.push({ name: '\u200b', value: '\u200b', inline: false });
    this.push({
      name: '🔗',
      value: linksMarkdown.slice(0, 1024),
      inline: false,
    });
  }
}

/** Mehrere volle Breite-Felder (kein „+ n weitere“), jeweils bis ~DISCORD_FIELD_VALUE_SAFE Zeichen. */
function appendLinesFullWidthChunks(packer: RaidEmbedFieldPacker, nameBase: string, lines: string[]): void {
  if (lines.length === 0) return;
  const CHUNK = DISCORD_FIELD_VALUE_SAFE;
  let part = 0;
  let i = 0;
  while (i < lines.length) {
    const chunk: string[] = [];
    let len = 0;
    while (i < lines.length) {
      const line = lines[i]!;
      const add = chunk.length ? 1 + line.length : line.length;
      if (len + add > CHUNK && chunk.length > 0) break;
      if (len + add > CHUNK && chunk.length === 0) {
        chunk.push(`${line.slice(0, Math.max(1, CHUNK - 1))}…`);
        i++;
        break;
      }
      chunk.push(line);
      len += add;
      i++;
    }
    part += 1;
    const name = part === 1 ? nameBase.slice(0, 256) : `${nameBase} (${part})`.slice(0, 256);
    packer.push({ name, value: chunk.join('\n').slice(0, 1024), inline: false });
  }
}

/** 2–3 Spalten als nebeneinanderliegende `inline`-Felder; mehrere Zeilen-Batches bei langen Listen. */
function appendLinesInColumnFields(
  packer: RaidEmbedFieldPacker,
  baseTitle: string,
  lines: string[],
  columnCount: 2 | 3
): void {
  if (lines.length === 0) return;
  let batch = 0;
  let idx = 0;
  while (idx < lines.length) {
    const cols: string[][] = Array.from({ length: columnCount }, () => []);
    let madeProgress = false;

    while (idx < lines.length) {
      let bestCol = 0;
      let minLen = Infinity;
      for (let c = 0; c < columnCount; c++) {
        const cell = cols[c].join('\n');
        const len = cell.length;
        if (len < minLen) {
          minLen = len;
          bestCol = c;
        }
      }
      const line = lines[idx]!;
      const colJoin = cols[bestCol].join('\n');
      const candidate = colJoin ? `${colJoin}\n${line}` : line;
      if (candidate.length <= DISCORD_FIELD_VALUE_SAFE) {
        cols[bestCol].push(line);
        idx++;
        madeProgress = true;
        continue;
      }
      if (cols[bestCol].length === 0) {
        cols[bestCol].push(`${line.slice(0, Math.max(1, DISCORD_FIELD_VALUE_SAFE - 1))}…`);
        idx++;
        madeProgress = true;
        continue;
      }
      break;
    }

    const title =
      batch === 0 ? baseTitle.slice(0, 256) : `${baseTitle} (${batch + 1})`.slice(0, 256);
    for (let c = 0; c < columnCount; c++) {
      const v = cols[c].join('\n') || '\u200b';
      packer.push({
        name: c === 0 ? title : '\u200b',
        value: v.slice(0, 1024),
        inline: true,
      });
    }
    batch++;
    if (!madeProgress && idx < lines.length) idx++;
  }
}

// ---------------------------------------------------------------------------
// Zusammenfassungs-Helfer (Rollen/Klassen + Anmeldungen)
// ---------------------------------------------------------------------------

function splitByRole(signups: RaidEmbedSignup[]): Record<string, RaidEmbedSignup[]> {
  const byRole: Record<string, RaidEmbedSignup[]> = { Tank: [], Melee: [], Range: [], Healer: [], '?': [] };
  for (const s of signups) {
    const spec = s.signedSpec?.trim() || s.mainSpec?.trim();
    const role = spec ? roleFromSpecDisplayName(spec) : null;
    (byRole[role ?? '?'] ??= []).push(s);
  }
  return byRole;
}

function countSignupsByClassId(signups: RaidEmbedSignup[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of signups) {
    const spec = s.signedSpec?.trim() || s.mainSpec?.trim() || '';
    const cid = getSpecByDisplayName(spec)?.classId;
    if (cid) counts.set(cid, (counts.get(cid) ?? 0) + 1);
  }
  return counts;
}

/** Spalte „Rollen“: alle Rollen, auch mit 0; Mindestvorgabe als count/min. */
function buildRoleCountsColumn(
  byRole: Record<string, RaidEmbedSignup[]>,
  mins: { Tank: number; Melee: number; Range: number; Healer: number },
  emojis: Record<string, string>,
  strings: RaidEmbedStrings,
): string {
  const lines = ROLE_KEYS.map((key) => {
    const count = byRole[key]?.length ?? 0;
    const min = mins[key] ?? 0;
    const emoji = getRoleEmoji(key, emojis);
    const countStr = min > 0 && count < min ? `**${count}/${min}**` : `**${count}**`;
    return `${emoji} ${strings.roleLabels[key]} · ${countStr}`;
  });
  return lines.join('\n').slice(0, 1024);
}

function formatClassCountLine(
  cls: (typeof TBC_CLASSES)[number],
  count: number,
  emojis: Record<string, string>,
): string {
  const emoji = getClassEmojiByClassId(cls.id, emojis);
  const prefix = emoji ? `${emoji} ` : '';
  return `${prefix}${cls.name} · **${count}**`;
}

/** Klassen-Zähler in zwei Spalten (alle TBC-Klassen, auch mit 0). */
function buildClassCountsColumns(
  signups: RaidEmbedSignup[],
  emojis: Record<string, string>,
): { left: string; right: string } {
  const counts = countSignupsByClassId(signups);
  const lines = TBC_CLASSES.map((cls) => formatClassCountLine(cls, counts.get(cls.id) ?? 0, emojis));
  const mid = Math.ceil(lines.length / 2);
  return {
    left: lines.slice(0, mid).join('\n').slice(0, 1024) || '\u200b',
    right: lines.slice(mid).join('\n').slice(0, 1024) || '\u200b',
  };
}

const EMPTY_PLAYER_SLOT = '·';

/** Spieler je Rolle in bis zu drei Spalten pro Zeile (Discord-Limit). */
function appendPlayersByRoleColumns(
  packer: RaidEmbedFieldPacker,
  byRole: Record<string, RaidEmbedSignup[]>,
  emojis: Record<string, string>,
  strings: RaidEmbedStrings,
): void {
  const pushRoleColumn = (key: string, label: string) => {
    const players = byRole[key] ?? [];
    const title = `${getRoleEmoji(key, emojis)} ${label}`.trim();
    if (players.length === 0) {
      packer.push({ name: title.slice(0, 256), value: EMPTY_PLAYER_SLOT, inline: true });
      return;
    }
    const lines = players.map((s) => playerLine(s, emojis, strings.guestTag));
    let part = 0;
    let i = 0;
    while (i < lines.length) {
      const chunk: string[] = [];
      let len = 0;
      while (i < lines.length) {
        const line = lines[i]!;
        const add = chunk.length ? 1 + line.length : line.length;
        if (len + add > DISCORD_FIELD_VALUE_SAFE && chunk.length > 0) break;
        if (len + add > DISCORD_FIELD_VALUE_SAFE && chunk.length === 0) {
          chunk.push(`${line.slice(0, Math.max(1, DISCORD_FIELD_VALUE_SAFE - 1))}…`);
          i++;
          break;
        }
        chunk.push(line);
        len += add;
        i++;
      }
      const name =
        part === 0 ? title.slice(0, 256) : `${title} (${part + 1})`.slice(0, 256);
      packer.push({
        name,
        value: chunk.join('\n').slice(0, 1024) || EMPTY_PLAYER_SLOT,
        inline: true,
      });
      part++;
    }
  };

  for (const key of ROLE_KEYS.slice(0, 3)) {
    pushRoleColumn(key, strings.roleLabels[key]);
  }
  packer.push({ name: '\u200b', value: '\u200b', inline: false });
  pushRoleColumn('Healer', strings.roleLabels.Healer);

  if ((byRole['?']?.length ?? 0) > 0) {
    packer.push({ name: '\u200b', value: '\u200b', inline: false });
    pushRoleColumn('?', strings.roleLabels['?']);
  }
}

function appendAnmeldungenSection(
  packer: RaidEmbedFieldPacker,
  mainSignups: RaidEmbedSignup[],
  byRole: Record<string, RaidEmbedSignup[]>,
  mins: { Tank: number; Melee: number; Range: number; Healer: number },
  emojis: Record<string, string>,
  strings: RaidEmbedStrings,
  opts?: { showPlayers?: boolean },
): void {
  const classes = buildClassCountsColumns(mainSignups, emojis);

  packer.push({
    name: strings.fields.roles,
    value: buildRoleCountsColumn(byRole, mins, emojis, strings),
    inline: true,
  });
  packer.push({
    name: strings.fields.classes,
    value: classes.left,
    inline: true,
  });
  packer.push({
    name: '\u200b',
    value: classes.right,
    inline: true,
  });

  packer.push({ name: '\u200b', value: '\u200b', inline: false });

  if (opts?.showPlayers === false) return;

  packer.push({ name: strings.fields.signups, value: '\u200b', inline: false });

  if (mainSignups.length > 0) {
    appendPlayersByRoleColumns(packer, byRole, emojis, strings);
    packer.push({ name: '\u200b', value: '\u200b', inline: false });
  } else {
    packer.push({ name: '\u200b', value: strings.fields.noSignups, inline: false });
  }
}

/** Je 5er-Spalte (G1, G2, …) ein inline-Embed-Feld mit Spielerzeilen unter „Raid N“. */
function appendRaidPartyColumnFields(
  packer: RaidEmbedFieldPacker,
  group: AnnouncedGroupPayload,
  signupById: Map<string, RaidEmbedSignup>,
  emojis: Record<string, string>,
  guestTag: string,
): void {
  const slots = group.partySlots ?? [];
  for (let pi = 0; pi < slots.length; pi++) {
    const row = slots[pi] ?? [];
    const lines: string[] = [];
    for (let c = 0; c < PLANNER_PARTY_SIZE; c++) {
      const id = row[c]?.trim() ?? '';
      const s = id ? signupById.get(id) : null;
      lines.push(s ? playerLine(s, emojis, guestTag) : '·');
    }
    packer.push({
      name: `G${pi + 1}`,
      value: lines.join('\n').slice(0, 1024) || '\u200b',
      inline: true,
    });
  }
}

/** Kompakte Rollen-Zeile im Kader-Header (angekündigte Raids) — unverändert zur ursprünglichen Darstellung. */
function groupRoleSummaryLine(
  signupIds: string[],
  signupById: Map<string, RaidEmbedSignup>,
  emojis: Record<string, string>,
): string {
  const counts: Record<string, number> = { Tank: 0, Melee: 0, Range: 0, Healer: 0 };
  for (const id of signupIds) {
    const s = signupById.get(id);
    if (!s) continue;
    const spec = s.signedSpec?.trim() || s.mainSpec?.trim();
    const role = spec ? roleFromSpecDisplayName(spec) : null;
    if (role && role in counts) counts[role]++;
  }
  return ROLE_KEYS
    .map((key) => `${getRoleEmoji(key, emojis)} ${counts[key]}`)
    .join('  ');
}

// ---------------------------------------------------------------------------
// Embed-Builder
// ---------------------------------------------------------------------------

export function buildRaidEmbeds(input: RaidEmbedInput): DiscordEmbed[] {
  const {
    raidId, guildId, raidName, dungeonNames, scheduledAt, signupUntil,
    status, maxPlayers, signupVisibility, signups, announcedGroupsJson,
    discordEmojis = {}, appUrl, locale = 'de',
  } = input;

  const strings = getRaidEmbedStrings(locale);
  const embedLocale = locale === 'en' ? 'en' : 'de';

  const minTanks   = input.minTanks   ?? 0;
  const minMelee   = input.minMelee   ?? 0;
  const minRange   = input.minRange   ?? 0;
  const minHealers = input.minHealers ?? 0;

  const isAnnounced = status === 'announced' || status === 'locked';
  const isRevealed  = signupVisibility === 'public' || isAnnounced;

  const announcedGroups = parseStoredGroups(announcedGroupsJson);

  const raidDisplayContext: RaidDisplayContext = {
    status,
    announcedPlannerGroupsJson: announcedGroupsJson,
  };
  const signupByIdForReserve = new Map(signups.map(s => [s.id, s]));
  const openReserveOrdered: RaidEmbedSignup[] = !isAnnounced
    ? orderedPublicReserveIds(signups, raidDisplayContext)
        .map(id => signupByIdForReserve.get(id))
        .filter((s): s is RaidEmbedSignup => !!s)
    : [];

  const title = `⚔️ ${raidName} — ${dungeonNames.join(' + ')}`.slice(0, 256);
  const color = embedColor(status, signupUntil);

  const base    = appUrl.replace(/\/$/, '');
  const dashUrl = `${base}/${embedLocale}/dashboard`;
  const raidUrl = `${base}/${embedLocale}/guild/${guildId}/raid/${raidId}`;
  const planUrl = `${base}/${embedLocale}/guild/${guildId}/raid/${raidId}/plan`;
  const linksMarkdown =
    `[${strings.fields.links.dashboard}](${dashUrl}) · [${strings.fields.links.viewRaid}](${raidUrl}) · [${strings.fields.links.planner}](${planUrl}) · ` +
    `[${strings.fields.links.coffee}](${KOFI_URL})`;

  const publicNotePlain = input.publicNote?.trim()
    ? plainTextForDiscord(input.publicNote.trim(), 3900)
    : '';
  const description = publicNotePlain
    ? `ℹ️ ${publicNotePlain}`.slice(0, 4096)
    : undefined;

  const packer = new RaidEmbedFieldPacker({
    title,
    ...(description ? { description } : {}),
    color,
  }, strings);

  const mainSignups = filterSignupsByPublicBucket(signups, raidDisplayContext, 'main');
  const uniquePlayers = isPublishedRaidStatus(status)
    ? new Set(signupsForPublicRoleCounts(signups, raidDisplayContext).map(s => s.userId)).size
    : new Set(mainSignups.map(s => s.userId)).size;

  const groupCount = announcedGroups?.groups.length ?? 1;
  const totalMax   = maxPlayers * groupCount;
  const anmeldungenValue = groupCount > 1
    ? strings.fields.slotsPerRaid(uniquePlayers, totalMax, maxPlayers)
    : `${uniquePlayers} / ${maxPlayers}`;

  const byRole = splitByRole(mainSignups);
  const roleMins = { Tank: minTanks, Melee: minMelee, Range: minRange, Healer: minHealers };

  const labelCol = [
    `📅 **${strings.fields.schedule}**`,
    `🗓️ **${strings.fields.signupUntil}**`,
    `📊 **${strings.fields.status}**`,
    `👥 **${strings.fields.slots}**`,
  ].join('\n');
  const valueCol = [
    `${formatDate(scheduledAt, strings)} · ${formatTime(scheduledAt, strings)}${strings.timeSuffix}`,
    `${formatDate(signupUntil, strings)} · ${formatTime(signupUntil, strings)}${strings.timeSuffix}`,
    statusText(status, signupUntil, strings),
    anmeldungenValue,
  ].join('\n');

  packer.push({ name: '\u200b', value: labelCol, inline: true });
  packer.push({ name: '\u200b', value: valueCol, inline: true });

  packer.push({ name: '\u200b', value: '\u200b', inline: false });

  if (isRevealed) {
    appendAnmeldungenSection(packer, mainSignups, byRole, roleMins, discordEmojis, strings, {
      showPlayers: !isAnnounced,
    });
    packer.push({ name: '\u200b', value: '\u200b', inline: false });
  }

  if (isAnnounced && announcedGroups && announcedGroups.groups.length > 0) {
    const signupById   = new Map(signups.map(s => [s.id, s]));
    const signupByUser = new Map(signups.map(s => [s.userId, s]));

    for (let gi = 0; gi < announcedGroups.groups.length; gi++) {
      if (gi > 0) {
        packer.push({ name: '\u200b', value: '\u200b', inline: false });
      }

      const group = announcedGroups.groups[gi];
      const headerLines: string[] = [];

      const leadSignup = group.raidLeaderUserId ? signupByUser.get(group.raidLeaderUserId) : null;
      const lootSignup = group.lootmasterUserId ? signupByUser.get(group.lootmasterUserId) : null;
      const headerParts: string[] = [];
      if (leadSignup?.characterName) {
        const label = embedCharacterLabel(leadSignup, strings.guestTag);
        if (label) headerParts.push(`👑 ${strings.fields.raidLeader}: **${label}**`);
      }
      if (lootSignup?.characterName) {
        const label = embedCharacterLabel(lootSignup, strings.guestTag);
        if (label) headerParts.push(`💰 ${strings.fields.lootMaster}: **${label}**`);
      }
      if (headerParts.length > 0) {
        headerLines.push(headerParts.join('  ·  '));
      }

      headerLines.push(groupRoleSummaryLine(group.rosterOrder, signupById, discordEmojis));
      headerLines.push('▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬');

      const headerValue =
        headerLines.length > 0 ? headerLines.join('\n').slice(0, 1024) : strings.fields.empty;
      packer.push({
        name: `Raid ${gi + 1}`,
        value: headerValue,
        inline: false,
      });

      const hasPartyLayout = (group.partySlots?.length ?? 0) > 0;
      if (hasPartyLayout) {
        appendRaidPartyColumnFields(packer, group, signupById, discordEmojis, strings.guestTag);
      } else {
        const playerLines: string[] = [];
        for (const signupId of group.rosterOrder) {
          const s = signupById.get(signupId);
          if (!s) continue;
          playerLines.push(playerLine(s, discordEmojis, strings.guestTag));
        }
        if (playerLines.length > 0) {
          appendLinesInColumnFields(
            packer,
            `Raid ${gi + 1} · ${strings.fields.roster}`,
            playerLines,
            3
          );
        } else {
          packer.push({ name: '\u200b', value: strings.fields.noRosterPlayers, inline: false });
        }
      }
    }

    packer.push({ name: '\u200b', value: '\u200b', inline: false });
    {
      const reserveIds = orderedPublicReserveIds(signups, {
        status,
        announcedPlannerGroupsJson: announcedGroupsJson,
      });
      const signupById2 = new Map(signups.map(s => [s.id, s]));
      const resLines = reserveIds
        .map(id => signupById2.get(id))
        .filter((s): s is RaidEmbedSignup => !!s)
        .map(s => playerLine(s, discordEmojis, strings.guestTag));
      const resTitle = `${strings.fields.reserve} (${resLines.length})`;
      if (resLines.length > 0) {
        appendLinesInColumnFields(packer, resTitle, resLines, 3);
      } else {
        packer.push({ name: resTitle, value: strings.fields.noReserve, inline: false });
      }
    }
  } else if (isRevealed && (mainSignups.length > 0 || openReserveOrdered.length > 0)) {
    const resTitle = `${strings.fields.reserve} (${openReserveOrdered.length})`;
    if (openReserveOrdered.length > 0) {
      appendLinesInColumnFields(
        packer,
        resTitle,
        openReserveOrdered.map(s => playerLine(s, discordEmojis, strings.guestTag)),
        3,
      );
    } else {
      packer.push({ name: resTitle, value: strings.fields.noReserve, inline: false });
    }
  } else if (!isRevealed) {
    const hint = openReserveOrdered.length > 0
      ? strings.fields.signupsHiddenWithReserve(openReserveOrdered.length)
      : strings.fields.notPublic;
    packer.push({ name: '\u200b', value: hint, inline: false });
    packer.push({
      name:  `${strings.fields.reserve} (${openReserveOrdered.length})`,
      value: strings.fields.reserveNotPublic,
      inline: false,
    });
  } else if (isRevealed) {
    packer.push({
      name: `${strings.fields.reserve} (0)`,
      value: strings.fields.noReserve,
      inline: false,
    });
  }

  packer.finalizeLinks(linksMarkdown);

  return packer.embeds;
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
        { type: 2, style: 2, label: 'Bearbeiten', emoji: { name: '✏️' }, custom_id: `rf:edit:${rid}:${gid}` },
      ],
    },
    {
      type: 1,
      components: [
        { type: 2, style: 4, label: 'Abmelden',    emoji: { name: '🚪' }, custom_id: `rf:unreg:${rid}:${gid}` },
        { type: 2, style: 4, label: 'Bin nicht da', emoji: { name: '🚫' }, custom_id: `rf:decl:${rid}:${gid}` },
      ],
    },
    {
      type: 1,
      components: [
        { type: 2, style: 2, label: 'Hilfe', emoji: { name: '❓' }, custom_id: `rf:help:${rid}:${gid}` },
        { type: 2, style: 2, label: 'RaidTools', emoji: { name: '🟡' }, custom_id: `rf:tools:${rid}:${gid}` },
        { type: 2, style: 2, label: 'Info @ Raidlead', emoji: { name: '🟡' }, custom_id: `rf:inforl:${rid}:${gid}` },
      ],
    },
  ];
}

/** Gast-Channel: gleiches Embed wie Raid-Channel, UI auf Englisch. */
export function buildGuestRaidEmbeds(input: RaidEmbedInput): DiscordEmbed[] {
  return buildRaidEmbeds({ ...input, locale: 'en' });
}

/** Gast-Channel-Buttons (English labels). */
export function buildGuestRaidActionButtons(
  raidId: string,
  guildId: string
): DiscordMessageComponent[] {
  const rid = uuidNoDash(raidId);
  const gid = uuidNoDash(guildId);

  return [
    {
      type: 1,
      components: [
        { type: 2, style: 3, label: 'Quickjoin', emoji: { name: '⚡' }, custom_id: `rf:qj:${rid}:${gid}` },
        { type: 2, style: 1, label: 'Sign up', emoji: { name: '📋' }, custom_id: `rf:join:${rid}:${gid}` },
        { type: 2, style: 2, label: 'Edit', emoji: { name: '✏️' }, custom_id: `rf:edit:${rid}:${gid}` },
      ],
    },
    {
      type: 1,
      components: [
        { type: 2, style: 4, label: 'Withdraw', emoji: { name: '🚪' }, custom_id: `rf:unreg:${rid}:${gid}` },
        { type: 2, style: 2, label: 'Info @ Raid lead', emoji: { name: '🟡' }, custom_id: `rf:inforl:${rid}:${gid}` },
        { type: 2, style: 2, label: 'RaidTools', emoji: { name: '🟡' }, custom_id: `rf:tools:${rid}:${gid}` },
        { type: 2, style: 2, label: 'Help', emoji: { name: '❓' }, custom_id: `rf:help:${rid}:${gid}` },
      ],
    },
  ];
}
