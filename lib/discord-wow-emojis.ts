/**
 * Mapping von WoW-Spec-Anzeigenamen und Rollen auf die Discord-Emoji-Keys
 * aus rf_app_config (discord_emojis JSON).
 *
 * Dieselbe Logik wie in discord-bot/app-home.js (SPEC_KEY_BY_DISPLAY etc.),
 * hier als TypeScript-Version für den Embed-Builder im Webapp.
 */

/** Spec-Anzeigename (mainSpec in DB) → Emoji-Key in discord_emojis */
export const SPEC_EMOJI_KEY: Record<string, string> = {
  'Holy Paladin':            'wow_holy_pala',
  'Protection Paladin':      'wow_protection',
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
  'Restoration Druid':       'wow_restoration',
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

/**
 * Gibt das Discord-Emoji-Markup für eine Spec zurück.
 * Fallback: leerer String.
 */
export function getSpecEmoji(spec: string, emojis: Record<string, string>): string {
  const key = SPEC_EMOJI_KEY[spec?.trim() ?? ''];
  return key ? (emojis[key] ?? '') : '';
}

/**
 * Gibt das Discord-Emoji-Markup für eine Rolle zurück.
 * Fallback: Unicode-Emoji.
 */
export function getRoleEmoji(
  role: string,
  emojis: Record<string, string>
): string {
  const key = ROLE_EMOJI_KEY[role];
  if (key && emojis[key]) return emojis[key];
  return ROLE_FALLBACK_EMOJI[role] ?? '❓';
}
