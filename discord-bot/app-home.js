/**
 * App Home / Dashboard-Light: Embeds für Signups + anstehende Raids (analog Web-Dashboard).
 * Fokus: viele Icons, wenig Text, Links zum Signup/Edit/Plan.
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

function isEphemeralContext(interaction) {
  return interaction.guildId != null;
}

function e(map, key, fallback = '') {
  if (!map || typeof map !== 'object') return fallback;
  const v = map[key];
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

const CLASS_KEY_BY_EN = {
  Warrior: 'wow_warrior',
  Warlock: 'wow_warlock',
  Shaman: 'wow_shaman',
  Priest: 'wow_priest',
  Paladin: 'wow_paladin',
  Mage: 'wow_mage',
  Hunter: 'wow_hunter',
  Druid: 'wow_druid',
};

const SPEC_KEY_BY_DISPLAY = {
  'Holy Paladin': 'wow_holy_pala',
  'Holy Priest': 'wow_holy_priest',
  'Discipline Priest': 'wow_discipline',
  'Shadow Priest': 'wow_shadow',
  'Protection Warrior': 'wow_protection',
  'Arms Warrior': 'wow_arms',
  'Fury Warrior': 'wow_fury',
  'Affliction Warlock': 'wow_affliction',
  'Demonology Warlock': 'wow_demonology',
  'Destruction Warlock': 'wow_destruction',
  'Restoration Shaman': 'wow_restoration',
  'Elemental Shaman': 'wow_elemental',
  'Enhancement Shaman': 'wow_enhancement',
  'Assassination Rogue': 'wow_assassination',
  'Combat Rogue': 'wow_combat',
  'Subtlety Rogue': 'wow_subtlety',
  'Arcane Mage': 'wow_arcane',
  'Fire Mage': 'wow_fire',
  'Frost Mage': 'wow_frost',
  'Beast Mastery Hunter': 'wow_beastmastery',
  'Marksmanship Hunter': 'wow_marksman',
  'Survival Hunter': 'wow_survival',
  'Balance Druid': 'wow_balance',
  'Feral Druid': 'wow_feral',
  'Feral (DPS) Druid': 'wow_feral',
  'Restoration Druid': 'wow_restoration',
};

const ROLE_KEY_BY_SPEC_KEY = {
  wow_protection: 'wow_tank',
  wow_arms: 'wow_melee',
  wow_fury: 'wow_melee',
  wow_affliction: 'wow_range',
  wow_demonology: 'wow_range',
  wow_destruction: 'wow_range',
  wow_restoration: 'wow_heal',
  wow_enhancement: 'wow_melee',
  wow_elemental: 'wow_range',
  wow_assassination: 'wow_melee',
  wow_combat: 'wow_melee',
  wow_subtlety: 'wow_melee',
  wow_shadow: 'wow_range',
  wow_discipline: 'wow_heal',
  wow_holy_priest: 'wow_heal',
  wow_holy_pala: 'wow_heal',
  wow_retribution: 'wow_melee',
  wow_frost: 'wow_range',
  wow_fire: 'wow_range',
  wow_arcane: 'wow_range',
  wow_survival: 'wow_range',
  wow_marksman: 'wow_range',
  wow_beastmastery: 'wow_range',
  wow_guardian: 'wow_tank',
  wow_feral: 'wow_melee',
  wow_balance: 'wow_range',
};

function classKeyFromSpecDisplayName(displayName) {
  if (!displayName) return null;
  const parts = String(displayName).trim().split(/\s+/);
  const last = parts[parts.length - 1];
  return CLASS_KEY_BY_EN[last] ?? null;
}

function fmtDateTime(locale, iso) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', month: '2-digit' }).format(d);
  return day;
}

function raidStatusIcon(status) {
  if (status === 'open') return '🟢';
  if (status === 'set') return '🟣';
  if (status === 'done') return '⚫';
  if (status === 'cancelled') return '🔴';
  return '⚪';
}

function placementPrefix(p) {
  if (p === 'confirmed') return '✅';
  if (p === 'substitute') return '🪑';
  if (p === 'signup') return '';
  return '';
}

function typeIcon(t) {
  const x = String(t || '').toLowerCase();
  if (x === 'uncertain') return '❓';
  if (x === 'reserve') return '🪑';
  if (x === 'normal' || x === 'main') return '📅';
  return '•';
}

function buildDashboardEmbeds(payload) {
  const accent = 0x3b82f6;
  const locale = 'de';
  const emojis = payload?.emojis ?? {};

  const top = new EmbedBuilder().setColor(accent).setTitle('🏠 RaidFlow Home');

  if (!payload?.linked) {
    top.setDescription('🔒 Bitte einmal in der Webapp mit Discord anmelden.');
    return [top];
  }

  const s = payload.stats || {
    signupCount: 0,
    confirmedCount: 0,
    reserveCount: 0,
    uncertainCount: 0,
    declinedCount: 0,
  };
  top.addFields({
    name: '📌 Anmeldung(en) Statusübersicht',
    value: `✅ Ges. ${s.confirmedCount}  •  🪑 Res. ${s.reserveCount}  •  ❓ Uns. ${s.uncertainCount}  •  🚫 Abs. ${s.declinedCount}`,
    inline: false,
  });

  const signups = new EmbedBuilder().setColor(accent).setTitle('✍️ Meine Anmeldungen');
  const rows = payload.mySignups || [];
  if (rows.length === 0) {
    signups.setDescription('_Keine anstehenden Anmeldungen._');
  } else {
    const lines = rows.slice(0, 10).map((r) => {
      const when = fmtDateTime(locale, r.scheduledAtIso);
      const place = placementPrefix(r.leaderPlacement);
      const typ = typeIcon(r.type);
      const confirm = r.setConfirmed ? '✅' : '';
      const specKey = r.signedSpec ? (SPEC_KEY_BY_DISPLAY[String(r.signedSpec).trim()] ?? null) : null;
      const roleKey = specKey ? (ROLE_KEY_BY_SPEC_KEY[specKey] ?? null) : null;
      const clsKey = r.signedSpec ? classKeyFromSpecDisplayName(r.signedSpec) : null;
      const roleEm = roleKey ? e(emojis, roleKey, '') : '';
      const classEm = clsKey ? e(emojis, clsKey, '') : '';
      const specEm = specKey ? e(emojis, specKey, '') : '';
      const iconGroup = `${roleEm}${classEm}${specEm}`.trim();
      const ch =
        r.signedCharacterName != null && String(r.signedCharacterName).trim()
          ? iconGroup
            ? `${iconGroup} ${r.signedCharacterName}`
            : r.signedCharacterName
          : '—';
      return `${place}${confirm}${typ} **${when}** · 🗺️ ${r.dungeonName} · ${ch}`.trim();
    });
    signups.setDescription(lines.join('\n').slice(0, 4000));
  }

  const raids = new EmbedBuilder().setColor(accent).setTitle('🗓️ Anstehende Raids');
  const rrows = payload.upcomingRaids || [];
  if (rrows.length === 0) {
    raids.setDescription('_Keine Raids im Zeitraum._');
  } else {
    const lines = rrows.slice(0, 10).map((r) => {
      const when = fmtDateTime(locale, r.scheduledAtIso);
      const st = raidStatusIcon(r.status);
      const counts = `👥 ${r.signupCount}/${r.maxPlayers}`;
      const view = r.links?.view ? `[👁️](${r.links.view})` : '';
      return `${st} **${when}** · 🗺️ ${r.dungeonName} · ${counts} ${view}`.trim();
    });
    raids.setDescription(lines.join('\n').slice(0, 4000));
  }

  const links = new EmbedBuilder().setColor(accent).setTitle('🔗 Links');
  const parts = [];
  if (payload.links?.dashboard) parts.push(`[📊 Dashboard](${payload.links.dashboard})`);
  if (payload.links?.profile) parts.push(`[👤 Profil](${payload.links.profile})`);
  if (payload.links?.newRaid) parts.push(`[➕ Neuer Raid](${payload.links.newRaid})`);
  links.setDescription(parts.join('  •  ') || '_—_');

  return [top, signups, raids, links];
}

function buildHeaderRow(payload) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rf_home_refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
  );

  if (payload?.links?.dashboard) {
    row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('📊 Dashboard').setURL(payload.links.dashboard));
  }
  if (payload?.links?.profile) {
    row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('👤 Profil').setURL(payload.links.profile));
  }
  if (payload?.links?.newRaid) {
    row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('➕ Neuer Raid').setURL(payload.links.newRaid));
  }

  return [row];
}

async function fetchUserHome(getWebappJson, discordUserId) {
  return getWebappJson('/api/bot/user-home', { discordUserId });
}

/**
 * Zentraler Rechte-Sync (Webapp) vor Bot-Home — gleiche Pipeline wie Member-Events, keine zweite Berechtigungslogik.
 * @param {import('discord.js').Interaction} interaction
 * @param {{ syncRaidFlowMemberFromDiscord?: (guildId: string, userId: string) => Promise<void> }} api
 */
async function maybeSyncRaidFlowMemberFromDiscord(interaction, api) {
  const guildId = interaction.guildId;
  const uid = interaction.user?.id;
  if (!guildId || !uid || typeof api.syncRaidFlowMemberFromDiscord !== 'function') return;
  await api.syncRaidFlowMemberFromDiscord(guildId, uid);
}

export async function sendAppHome(interaction, api) {
  const ephemeral = isEphemeralContext(interaction);
  const discordUserId = interaction.user.id;

  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral });
    }
    await maybeSyncRaidFlowMemberFromDiscord(interaction, api);
    const payload = await fetchUserHome(api.getWebappJson, discordUserId);
    await interaction.editReply({
      embeds: buildDashboardEmbeds(payload),
      components: buildHeaderRow(payload),
    });
  } catch (e) {
    const msg = `Home konnte nicht geladen werden: ${e.message}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: msg, embeds: [], components: [] }).catch(() => {});
    } else {
      await interaction.reply({ content: msg, ephemeral }).catch(() => {});
    }
  }
}

/** @returns {Promise<boolean>} */
export async function handleAppHomeInteraction(interaction, api) {
  const { getWebappJson } = api;
  const uid = interaction.user.id;

  if (interaction.isPrimaryEntryPointCommand()) {
    await sendAppHome(interaction, api);
    return true;
  }

  if (interaction.isButton() && interaction.customId === 'rf_home_refresh') {
    await interaction.deferUpdate().catch(() => {});
    try {
      await maybeSyncRaidFlowMemberFromDiscord(interaction, api);
      const payload = await fetchUserHome(getWebappJson, uid);
      await interaction.editReply({
        embeds: buildDashboardEmbeds(payload),
        components: buildHeaderRow(payload),
      });
    } catch (e) {
      await interaction.editReply({
        content: `Aktualisieren fehlgeschlagen: ${e.message}`,
        embeds: [],
        components: [],
      }).catch(() => {});
    }
    return true;
  }

  return false;
}

