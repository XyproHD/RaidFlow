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

function parseKey(value) {
  const [guildId, raidId] = String(value || '').split(':');
  if (!guildId || !raidId) return null;
  return { guildId, raidId };
}

function raidKey(guildId, raidId) {
  return `${guildId}:${raidId}`;
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

function placementIcon(p) {
  if (p === 'confirmed') return '✅';
  if (p === 'substitute') return '🪑';
  if (p === 'signup') return '✍️';
  return '•';
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
    const legend = `_Legende: ${e(emojis, 'wow_tank', '🛡️')} Tank · ${e(emojis, 'wow_melee', '⚔️')} Melee · ${e(emojis, 'wow_range', '🏹')} Range · ${e(emojis, 'wow_heal', '💚')} Heal · 📅 normal · ❓ unsicher · 🪑 reserve · ✅ gesetzt · >[🛠️]< bearbeiten · >[🚪]< abmelden_`;
    const lines = rows.slice(0, 10).map((r) => {
      const when = fmtDateTime(locale, r.scheduledAtIso);
      const place = placementIcon(r.leaderPlacement);
      const typ = typeIcon(r.type);
      const confirm = r.setConfirmed ? '✅' : '';
      const ch = r.signedCharacterName ? `👤 ${r.signedCharacterName}` : '👤 —';
      const specKey = r.signedSpec ? (SPEC_KEY_BY_DISPLAY[String(r.signedSpec).trim()] ?? null) : null;
      const roleKey = specKey ? (ROLE_KEY_BY_SPEC_KEY[specKey] ?? null) : null;
      const clsKey = r.signedSpec ? classKeyFromSpecDisplayName(r.signedSpec) : null;
      const sp = r.signedSpec
        ? `${roleKey ? e(emojis, roleKey, '') + ' ' : ''}${specKey ? e(emojis, specKey, '') + ' ' : ''}${clsKey ? e(emojis, clsKey, '') + ' ' : ''}${r.signedSpec}`
        : '';
      const link = r.links?.signup ? `>[🛠️](${r.links.signup})<` : '';
      return `${place}${confirm}${typ} **${when}** · 🗺️ ${r.dungeonName} · ${ch}${sp ? ` · ${sp}` : ''} ${link}`.trim();
    });
    signups.setDescription([legend, '', ...lines].join('\n').slice(0, 4000));
  }

  const raids = new EmbedBuilder().setColor(accent).setTitle('🗓️ Anstehende Raids');
  const rrows = payload.upcomingRaids || [];
  if (rrows.length === 0) {
    raids.setDescription('_Keine Raids im Zeitraum._');
  } else {
    const legend = '_Legende: >[⚡]< one-click · >[✍️]< anmelden · >[🚪]< abmelden · >[👁️]< view · >[⚙️]< edit · >[🧩]< planen_';
    const lines = rrows.slice(0, 10).map((r) => {
      const when = fmtDateTime(locale, r.scheduledAtIso);
      const st = raidStatusIcon(r.status);
      const counts = `👥 ${r.signupCount}/${r.maxPlayers}`;
      const signup = r.links?.signup ? `>[✍️](${r.links.signup})<` : '';
      const edit = r.links?.edit ? `>[⚙️](${r.links.edit})<` : '';
      const plan = r.links?.plan ? `>[🧩](${r.links.plan})<` : '';
      return `${st} **${when}** · 🗺️ ${r.dungeonName} · ${counts} ${signup} ${edit} ${plan}`.trim();
    });
    raids.setDescription([legend, '', ...lines].join('\n').slice(0, 4000));
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

function buildSelectRows(payload) {
  const rows = [];

  if (payload?.linked && Array.isArray(payload.mySignups) && payload.mySignups.length > 0) {
    rows.push(
      new ActionRowBuilder().addComponents({
        type: 3,
        custom_id: 'rf_home_select_my_signup',
        placeholder: 'Meine Anmeldungen – Raid wählen',
        options: payload.mySignups.slice(0, 25).map((s) => ({
          label: `${s.dungeonName} · ${fmtDateTime('de', s.scheduledAtIso)}`.slice(0, 100),
          value: raidKey(s.guildId, s.raidId),
        })),
      })
    );
  }

  if (payload?.linked && Array.isArray(payload.upcomingRaids) && payload.upcomingRaids.length > 0) {
    rows.push(
      new ActionRowBuilder().addComponents({
        type: 3,
        custom_id: 'rf_home_select_upcoming',
        placeholder: 'Anstehende Raids – Raid wählen',
        options: payload.upcomingRaids.slice(0, 25).map((r) => ({
          label: `${r.dungeonName} · ${fmtDateTime('de', r.scheduledAtIso)} · ${r.signupCount}/${r.maxPlayers}`.slice(0, 100),
          value: raidKey(r.guildId, r.id),
        })),
      })
    );
  }

  return rows;
}

function buildRaidActionRows(raid, isSignedUp) {
  const rows = [];
  const row = new ActionRowBuilder();

  if (isSignedUp) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`rf_home_unsub:${raid.guildId}:${raid.id}`)
        .setLabel('🚪 Abmelden')
        .setStyle(ButtonStyle.Danger)
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`rf_home_signup1:${raid.guildId}:${raid.id}`)
        .setLabel('⚡ One-Click')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`rf_home_signupwiz:${raid.guildId}:${raid.id}`)
        .setLabel('✍️ Anmelden')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  if (raid.links?.view) {
    row.addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('👁️ View').setURL(raid.links.view)
    );
  }

  rows.push(row);
  return rows;
}

function findRaidInPayload(payload, guildId, raidId) {
  const upcoming = (payload?.upcomingRaids || []).find((r) => r.guildId === guildId && r.id === raidId);
  if (upcoming) return upcoming;
  const my = (payload?.mySignups || []).find((s) => s.guildId === guildId && s.raidId === raidId);
  if (!my) return null;
  return {
    id: my.raidId,
    guildId: my.guildId,
    dungeonName: my.dungeonName,
    scheduledAtIso: my.scheduledAtIso,
    signupCount: null,
    maxPlayers: null,
    status: my.raidStatus,
    links: { view: my.links?.view ?? null, signup: my.links?.signup ?? null },
    canEdit: false,
    mySignup: null,
  };
}

async function fetchUserHome(getWebappJson, discordUserId) {
  return getWebappJson('/api/bot/user-home', { discordUserId });
}

export async function sendAppHome(interaction, api) {
  const ephemeral = isEphemeralContext(interaction);
  const discordUserId = interaction.user.id;

  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral });
    }
    const payload = await fetchUserHome(api.getWebappJson, discordUserId);
    await interaction.editReply({
      embeds: buildDashboardEmbeds(payload),
      components: [...buildHeaderRow(payload), ...buildSelectRows(payload)],
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
  const { getWebappJson, callWebapp } = api;
  const uid = interaction.user.id;

  if (interaction.isPrimaryEntryPointCommand()) {
    await sendAppHome(interaction, api);
    return true;
  }

  if (interaction.isButton() && interaction.customId === 'rf_home_refresh') {
    await interaction.deferUpdate().catch(() => {});
    try {
      const payload = await fetchUserHome(getWebappJson, uid);
      await interaction.editReply({
        embeds: buildDashboardEmbeds(payload),
        components: [...buildHeaderRow(payload), ...buildSelectRows(payload)],
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

  if (interaction.isStringSelectMenu()) {
    const id = interaction.customId;
    if (id !== 'rf_home_select_my_signup' && id !== 'rf_home_select_upcoming') return false;
    const parsed = parseKey(interaction.values?.[0]);
    if (!parsed) return false;
    await interaction.deferUpdate().catch(() => {});
    try {
      const payload = await fetchUserHome(getWebappJson, uid);
      const raid = findRaidInPayload(payload, parsed.guildId, parsed.raidId);
      if (!raid) {
        await interaction.editReply({
          content: 'Raid nicht gefunden (Sitzung evtl. veraltet). Bitte Refresh.',
          embeds: buildDashboardEmbeds(payload),
          components: [...buildHeaderRow(payload), ...buildSelectRows(payload)],
        });
        return true;
      }
      const isSignedUp = !!(raid.mySignup || (payload.mySignups || []).some((s) => s.guildId === parsed.guildId && s.raidId === parsed.raidId));
      await interaction.editReply({
        embeds: buildDashboardEmbeds(payload),
        components: [...buildHeaderRow(payload), ...buildSelectRows(payload), ...buildRaidActionRows(raid, isSignedUp)],
      });
    } catch (e) {
      await interaction.editReply({ content: `Auswahl fehlgeschlagen: ${e.message}`, embeds: [], components: [] }).catch(() => {});
    }
    return true;
  }

  if (interaction.isButton()) {
    const cid = interaction.customId || '';
    const m1 = cid.match(/^rf_home_unsub:([^:]+):([^:]+)$/);
    const m2 = cid.match(/^rf_home_signup1:([^:]+):([^:]+)$/);
    const m3 = cid.match(/^rf_home_signupwiz:([^:]+):([^:]+)$/);

    if (m1) {
      await interaction.deferUpdate().catch(() => {});
      try {
        await callWebapp('/api/bot/raid-signup', {
          action: 'delete',
          discordUserId: uid,
          guildId: m1[1],
          raidId: m1[2],
        });
        const payload = await fetchUserHome(getWebappJson, uid);
        await interaction.editReply({
          content: '✅ Abgemeldet.',
          embeds: buildDashboardEmbeds(payload),
          components: [...buildHeaderRow(payload), ...buildSelectRows(payload)],
        });
      } catch (e) {
        await interaction.editReply({ content: `Abmelden fehlgeschlagen: ${e.message}`, embeds: [], components: [] }).catch(() => {});
      }
      return true;
    }

    if (m2) {
      await interaction.deferUpdate().catch(() => {});
      try {
        await callWebapp('/api/bot/raid-signup', {
          action: 'create',
          mode: 'oneclick',
          discordUserId: uid,
          guildId: m2[1],
          raidId: m2[2],
        });
        const payload = await fetchUserHome(getWebappJson, uid);
        await interaction.editReply({
          content: '✅ Angemeldet (One-Click).',
          embeds: buildDashboardEmbeds(payload),
          components: [...buildHeaderRow(payload), ...buildSelectRows(payload)],
        });
      } catch (e) {
        await interaction.editReply({ content: `Anmelden fehlgeschlagen: ${e.message}`, embeds: [], components: [] }).catch(() => {});
      }
      return true;
    }

    if (m3) {
      // Minimal Wizard: Character + type (normal/uncertain/reserve)
      await interaction.deferUpdate().catch(() => {});
      try {
        const guildId = m3[1];
        const raidId = m3[2];
        const chars = await getWebappJson('/api/bot/user-characters', { discordUserId: uid, guildId });
        const options = (chars?.characters || []).slice(0, 25).map((c) => ({
          label: (c.isMain ? `★ ${c.name}` : c.name).slice(0, 100),
          value: c.id,
        }));
        if (options.length === 0) {
          await interaction.editReply({ content: 'Kein Charakter für diese Gilde gefunden.', embeds: [], components: [] }).catch(() => {});
          return true;
        }
        const row1 = new ActionRowBuilder().addComponents({
          type: 3,
          custom_id: `rf_home_wiz_char:${guildId}:${raidId}`,
          placeholder: 'Charakter wählen',
          options,
        });
        const row2 = new ActionRowBuilder().addComponents({
          type: 3,
          custom_id: `rf_home_wiz_type:${guildId}:${raidId}`,
          placeholder: 'Typ wählen',
          options: [
            { label: '📅 Normal', value: 'normal' },
            { label: '❓ Unsicher', value: 'uncertain' },
            { label: '🪑 Reserve', value: 'reserve' },
          ],
        });
        await interaction.editReply({
          content: '✍️ Anmeldung – wähle Charakter und Typ.',
          embeds: [],
          components: [row1, row2],
        });
      } catch (e) {
        await interaction.editReply({ content: `Wizard konnte nicht gestartet werden: ${e.message}`, embeds: [], components: [] }).catch(() => {});
      }
      return true;
    }
  }

  if (interaction.isStringSelectMenu()) {
    const cid = interaction.customId || '';
    const mChar = cid.match(/^rf_home_wiz_char:([^:]+):([^:]+)$/);
    const mType = cid.match(/^rf_home_wiz_type:([^:]+):([^:]+)$/);
    // We use message components state in message: store selections in memory by user
    if (mChar || mType) {
      await interaction.deferUpdate().catch(() => {});
      const guildId = (mChar || mType)[1];
      const raidId = (mChar || mType)[2];
      const key = `rf_wiz:${uid}:${guildId}:${raidId}`;
      globalThis.__rfHomeWiz = globalThis.__rfHomeWiz || new Map();
      const map = globalThis.__rfHomeWiz;
      const cur = map.get(key) || {};
      if (mChar) cur.characterId = interaction.values[0];
      if (mType) cur.type = interaction.values[0];
      map.set(key, { ...cur, updatedAt: Date.now() });

      if (cur.characterId && cur.type) {
        try {
          await callWebapp('/api/bot/raid-signup', {
            action: 'create',
            mode: 'custom',
            discordUserId: uid,
            guildId,
            raidId,
            characterId: cur.characterId,
            type: cur.type,
          });
          map.delete(key);
          const payload = await fetchUserHome(getWebappJson, uid);
          await interaction.editReply({
            content: '✅ Angemeldet.',
            embeds: buildDashboardEmbeds(payload),
            components: [...buildHeaderRow(payload), ...buildSelectRows(payload)],
          });
        } catch (e) {
          await interaction.editReply({ content: `Anmelden fehlgeschlagen: ${e.message}`, embeds: [], components: [] }).catch(() => {});
        }
      }
      return true;
    }
  }

  return false;
}

