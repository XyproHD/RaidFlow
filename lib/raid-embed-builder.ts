/**
 * Baut den Discord-Embed und die Action-Buttons für Raid-Posts.
 * Wird beim Erstellen und bei jedem Update des Raids aufgerufen.
 */
import { roleFromSpecDisplayName } from '@/lib/spec-to-role';
import type { DiscordEmbed, DiscordMessageComponent } from '@/lib/discord-guild-api';

// ---------------------------------------------------------------------------
// Farben je Status
// ---------------------------------------------------------------------------
const COLOR = {
  open_signup_open:   0x57F287, // grün
  open_signup_closed: 0xFEE75C, // gelb
  announced:          0x5865F2, // Discord-Blurple
  locked:             0xEB459E, // pink/fuchsia
  cancelled:          0xED4245, // rot
} as const;

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------
export type RaidEmbedSignup = {
  userId: string;
  characterName?: string | null;
  mainSpec?: string | null;
  signedSpec?: string | null;
  isMain?: boolean | null;
  leaderPlacement?: string | null;
  isLate?: boolean;
  type: string; // normal | uncertain | reserve | declined
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
  announcedGroupsJson?: unknown; // announced_planner_groups_json
  appUrl: string;
  locale?: string;
};

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/** UUID-Striche entfernen für kompaktere customIds (32 statt 36 Zeichen). */
export function uuidNoDash(uuid: string): string {
  return uuid.replace(/-/g, '');
}

/** 32-Zeichen-String zurück in UUID-Format bringen. */
export function noDashToUuid(s: string): string {
  if (s.length !== 32) return s;
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

function formatDE(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', ...opts }).format(date);
}

function formatDateTime(date: Date): string {
  const d = formatDE(date, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  const t = formatDE(date, { hour: '2-digit', minute: '2-digit' });
  return `${d} · ${t} Uhr`;
}

function embedColor(status: string, signupUntil: Date): number {
  if (status === 'cancelled') return COLOR.cancelled;
  if (status === 'locked')    return COLOR.locked;
  if (status === 'announced') return COLOR.announced;
  return new Date() > signupUntil ? COLOR.open_signup_closed : COLOR.open_signup_open;
}

function statusLabel(status: string, signupUntil: Date): string {
  if (status === 'cancelled') return '🔴 Abgesagt';
  if (status === 'locked')    return '🔒 Gesetzt';
  if (status === 'announced') return '📢 Angekündigt';
  if (new Date() > signupUntil) return '🟡 Offen (Anmeldeschluss vorbei)';
  return '🟢 Offen';
}

function signupUntilLabel(signupUntil: Date): string {
  return new Date() > signupUntil ? '🔴 Geschlossen' : '🟢 Offen';
}

function placementPrefix(placement: string | null | undefined): string {
  if (placement === 'confirmed') return '[G] ';
  if (placement === 'substitute') return '[E] ';
  return '';
}

function signupLine(s: RaidEmbedSignup): string {
  const spec      = s.signedSpec?.trim() || s.mainSpec?.trim() || '?';
  const charName  = s.characterName || '?';
  const twink     = s.isMain === false ? ' *(T)*' : '';
  const late      = s.isLate ? ' ⏱' : '';
  const pl        = placementPrefix(s.leaderPlacement);
  return `${pl}${charName} (${spec})${twink}${late}`;
}

/** Zählt Gruppen in announced_planner_groups_json. */
function countAnnouncedGroups(json: unknown): number {
  if (!json || typeof json !== 'object') return 0;
  const data = json as Record<string, unknown>;
  if (!Array.isArray(data.groups)) return 0;
  return data.groups.length;
}

// ---------------------------------------------------------------------------
// Embed-Builder
// ---------------------------------------------------------------------------

export function buildRaidEmbed(input: RaidEmbedInput): DiscordEmbed {
  const {
    raidId, guildId, raidName, dungeonNames, scheduledAt, signupUntil,
    status, maxPlayers, signupVisibility, signups, announcedGroupsJson,
    appUrl, locale = 'de',
  } = input;

  const now = new Date();
  const isRevealed = signupVisibility === 'public' || status === 'locked' || status === 'announced';

  // --- Titel ---
  const title = `⚔️ ${raidName} — ${dungeonNames.join(' + ')}`.slice(0, 256);

  // --- Farbe ---
  const color = embedColor(status, signupUntil);

  // --- Links in Description ---
  const base     = appUrl.replace(/\/$/, '');
  const dashUrl  = `${base}/${locale}/dashboard`;
  const raidUrl  = `${base}/${locale}/guild/${guildId}/raid/${raidId}`;
  const planUrl  = `${base}/${locale}/guild/${guildId}/raid/${raidId}/plan`;
  const description =
    `[🏠 Dashboard](${dashUrl}) · [⚔️ Raid ansehen](${raidUrl}) · [📋 Planer](${planUrl})`;

  // --- Felder ---
  const fields: NonNullable<DiscordEmbed['fields']> = [];

  fields.push({
    name:   '📅 Termin',
    value:  formatDateTime(scheduledAt),
    inline: true,
  });

  fields.push({
    name:   '⏳ Anmeldung bis',
    value:  `${formatDateTime(signupUntil)}\n${signupUntilLabel(signupUntil)}`,
    inline: true,
  });

  fields.push({
    name:   '📊 Raid-Status',
    value:  statusLabel(status, signupUntil),
    inline: true,
  });

  // Spielerzahl (unique Discord-User-IDs, ohne Reserve)
  const mainSignups    = signups.filter(s => s.type !== 'reserve' && s.type !== 'declined');
  const reserveSignups = signups.filter(s => s.type === 'reserve');
  const uniquePlayers  = new Set(mainSignups.map(s => s.userId)).size;
  const groupCount     = countAnnouncedGroups(announcedGroupsJson);

  let playerValue = `**${uniquePlayers}** / ${maxPlayers}`;
  if (groupCount > 1) playerValue += `  ·  ${groupCount} Gruppen`;

  fields.push({
    name:   '👥 Anmeldungen',
    value:  playerValue,
    inline: true,
  });

  if (isRevealed && mainSignups.length > 0) {
    // --- Anmeldungen nach Rolle ---
    const byRole: Record<string, RaidEmbedSignup[]> = {
      Tank: [], Melee: [], Range: [], Healer: [], '?': [],
    };
    for (const s of mainSignups) {
      const spec = s.signedSpec?.trim() || s.mainSpec?.trim();
      const role = spec ? roleFromSpecDisplayName(spec) : null;
      (byRole[role ?? '?'] ??= []).push(s);
    }

    const roleGroups = [
      { label: 'Tanks',     emoji: '🛡️', key: 'Tank'   },
      { label: 'Nahkampf',  emoji: '⚔️',  key: 'Melee'  },
      { label: 'Fernkampf', emoji: '🏹',  key: 'Range'  },
      { label: 'Heiler',    emoji: '💚',  key: 'Healer' },
    ];

    for (const { label, emoji, key } of roleGroups) {
      const group = byRole[key];
      if (!group?.length) continue;
      const lines = group.map(signupLine);
      // Feld-Wert max 1024 Zeichen; bei vielen Einträgen kürzen
      let value = lines.join('\n');
      if (value.length > 1000) {
        const shown   = lines.filter((_, i) => lines.slice(0, i + 1).join('\n').length <= 950);
        const rest    = lines.length - shown.length;
        value = shown.join('\n') + `\n*… und ${rest} weitere*`;
      }
      fields.push({
        name:   `${emoji} ${label} (${group.length})`,
        value:  value,
        inline: false,
      });
    }

    if (byRole['?'].length > 0) {
      const lines = byRole['?'].map(signupLine);
      fields.push({
        name:   `❓ Unbekannte Rolle (${byRole['?'].length})`,
        value:  lines.join('\n').slice(0, 1024),
        inline: false,
      });
    }

    // --- Reserve ---
    if (reserveSignups.length > 0) {
      const lines = reserveSignups.map(signupLine);
      let value = lines.join('\n');
      if (value.length > 1000) {
        const shown = lines.filter((_, i) => lines.slice(0, i + 1).join('\n').length <= 950);
        value = shown.join('\n') + `\n*… und ${lines.length - shown.length} weitere*`;
      }
      fields.push({
        name:   `📋 Reserve (${reserveSignups.length})`,
        value,
        inline: false,
      });
    }
  } else if (!isRevealed) {
    // Signups versteckt
    const hint = reserveSignups.length > 0
      ? `🔒 Anmeldungen nicht öffentlich · ${reserveSignups.length} auf Reserve`
      : '🔒 Anmeldungen nicht öffentlich';
    fields.push({
      name:   '👁️ Anmeldungen',
      value:  hint,
      inline: false,
    });
  } else if (mainSignups.length === 0) {
    fields.push({
      name:   '📭 Anmeldungen',
      value:  'Noch keine Anmeldungen.',
      inline: false,
    });
  }

  return {
    title,
    description,
    color,
    fields,
    timestamp: scheduledAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

/**
 * Erstellt die Action-Row mit den vier Raid-Buttons.
 * customId-Format: rf:<action>:<raidIdNoDash>:<guildIdNoDash>
 * Maximale Länge: 8 + 32 + 1 + 32 = 73 Zeichen (< 100 Limit).
 */
export function buildRaidActionButtons(
  raidId: string,
  guildId: string
): DiscordMessageComponent {
  const rid = uuidNoDash(raidId);
  const gid = uuidNoDash(guildId);

  return {
    type: 1, // ACTION_ROW
    components: [
      {
        type:      2, // BUTTON
        style:     3, // Success (grün)
        label:     'Quickjoin',
        emoji:     { name: '⚡' },
        custom_id: `rf:qj:${rid}:${gid}`,
      },
      {
        type:      2,
        style:     1, // Primary (blau)
        label:     'Anmelden',
        emoji:     { name: '📋' },
        custom_id: `rf:join:${rid}:${gid}`,
      },
      {
        type:      2,
        style:     2, // Secondary (grau)
        label:     'Bearbeiten',
        emoji:     { name: '✏️' },
        custom_id: `rf:edit:${rid}:${gid}`,
      },
      {
        type:      2,
        style:     4, // Danger (rot)
        label:     'Abmelden',
        emoji:     { name: '🚪' },
        custom_id: `rf:unreg:${rid}:${gid}`,
      },
    ],
  };
}
