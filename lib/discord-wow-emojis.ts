/**
 * Mapping von WoW-Spec-Anzeigenamen und Rollen auf die Discord-Emoji-Keys
 * aus rf_app_config (discord_emojis JSON) bzw. externer Emoji-Guild (wow_*).
 *
 * Dieselbe Logik wie in discord-bot/app-home.js (SPEC_KEY_BY_DISPLAY etc.),
 * hier als TypeScript-Version für den Embed-Builder im Webapp.
 */
import { getClassEnglishName } from '@/lib/wow-tbc-classes';

/** Spec-Anzeigename (mainSpec in DB) → Emoji-Key in discord_emojis */
export const SPEC_EMOJI_KEY: Record<string, string> = {
  'Holy Paladin':            'wow_holy_pala',
  'Protection Paladin':      'wow_protection_pala',
  'Retribution Paladin':     'wow_retribution',
  'Holy Priest':             'wow_holy_priest',
  'Discipline Priest':       'wow_discipline',
  'Shadow Priest':           'wow_shadow',
  'Protection Warrior':      'wow_protection',
  'Arms Warrior':            'wow_arms',
  'Fury Warrior':            'wow_fury',
  'Affliction Warlock':      'wow_affliction',
  'Demonology Warlock':      'wow_demonology',
  'Destruction Warlock':     'wow_destruction',
  'Restoration Shaman':      'wow_restoration',
  'Elemental Shaman':        'wow_elemental',
  'Enhancement Shaman':      'wow_enhancement',
  'Assassination Rogue':     'wow_assassination',
  'Combat Rogue':            'wow_combat',
  'Subtlety Rogue':          'wow_subtlety',
  'Arcane Mage':             'wow_arcane',
  'Fire Mage':               'wow_fire',
  'Frost Mage':              'wow_frost',
  'Beast Mastery Hunter':    'wow_beastmastery',
  'Marksmanship Hunter':     'wow_marksman',
  'Survival Hunter':         'wow_survival',
  'Balance Druid':           'wow_balance',
  'Feral Druid':             'wow_feral',
  'Feral (DPS) Druid':       'wow_feral',
  'Restoration Druid':       'wow_restoration_druid',
  // Mists of Pandaria
  'Brewmaster Monk':         'wow_tank',
  'Mistweaver Monk':         'wow_heal',
  'Windwalker Monk':         'wow_melee',
  'Blood Death Knight':      'wow_tank',
  'Frost Death Knight':      'wow_melee',
  'Unholy Death Knight':     'wow_melee',
  'Havoc Demon Hunter':      'wow_melee',
  'Vengeance Demon Hunter':  'wow_tank',
};

/** Rolle → Emoji-Key in discord_emojis */
export const ROLE_EMOJI_KEY: Record<string, string> = {
  Tank:   'wow_tank',
  Melee:  'wow_melee',
  Range:  'wow_range',
  Healer: 'wow_heal',
};

/** Fallback-Emojis wenn kein Discord-Server-Emoji konfiguriert */
export const ROLE_FALLBACK_EMOJI: Record<string, string> = {
  Tank:   '🛡️',
  Melee:  '⚔️',
  Range:  '🏹',
  Healer: '💚',
};

/** Klassen-Name (letztes Wort aus Spec-Anzeigename) → Emoji-Key in discord_emojis */
export const CLASS_EMOJI_KEY: Record<string, string> = {
  Druid:   'wow_druid',
  Hunter:  'wow_hunter',
  Mage:    'wow_mage',
  Paladin: 'wow_paladin',
  Priest:  'wow_priest',
  Rogue:   'wow_rogue',
  Shaman:  'wow_shaman',
  Warlock: 'wow_warlock',
  Warrior: 'wow_warrior',
  // MoP-Klassen
  Monk:    'wow_monk',
};

/**
 * Extrahiert den Klassenname aus einem Spec-Anzeigenamen.
 * "Holy Paladin" → "Paladin", "Feral (DPS) Druid" → "Druid".
 */
export function getClassFromSpec(spec: string): string {
  const parts = (spec ?? '').trim().split(' ');
  return parts[parts.length - 1] ?? '';
}

/** Discord-Markup aus rf_app_config / externer Emoji-Guild (`<:wow_*:id>`). */
function resolveDiscordWowEmoji(
  key: string | undefined,
  emojis: Record<string, string>,
  unicodeFallback?: string
): string {
  if (key) {
    const markup = emojis[key]?.trim();
    if (markup) return markup;
  }
  return unicodeFallback ?? '';
}

function classEmojiKeyForClassId(classId: string): string | undefined {
  const english = getClassEnglishName(classId);
  return CLASS_EMOJI_KEY[english];
}

/**
 * Klassen-Emoji per classId (druid, …) → wow_druid usw.
 */
export function getClassEmojiByClassId(
  classId: string,
  emojis: Record<string, string>
): string {
  return resolveDiscordWowEmoji(classEmojiKeyForClassId(classId), emojis);
}

/**
 * Gibt das Discord-Emoji-Markup für eine Spec zurück.
 * Fallback: Klassen-Emoji (wow_*), sonst leer.
 */
export function getSpecEmoji(spec: string, emojis: Record<string, string>): string {
  const trimmed = spec?.trim() ?? '';
  const specMarkup = resolveDiscordWowEmoji(SPEC_EMOJI_KEY[trimmed], emojis);
  if (specMarkup) return specMarkup;
  return getClassEmoji(trimmed, emojis);
}

/**
 * Gibt das Discord-Emoji-Markup für die Klasse eines Specs zurück (wow_druid, …).
 */
export function getClassEmoji(spec: string, emojis: Record<string, string>): string {
  const className = getClassFromSpec(spec);
  return resolveDiscordWowEmoji(CLASS_EMOJI_KEY[className], emojis);
}

/**
 * Gibt das Discord-Emoji-Markup für eine Rolle zurück (wow_tank, …).
 * Fallback: Unicode nur wenn kein Server-Emoji konfiguriert ist.
 */
export function getRoleEmoji(
  role: string,
  emojis: Record<string, string>
): string {
  return resolveDiscordWowEmoji(
    ROLE_EMOJI_KEY[role],
    emojis,
    ROLE_FALLBACK_EMOJI[role] ?? '❓'
  );
}
