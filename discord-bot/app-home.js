/**
 * App Home / Dashboard-Light: Embeds für Signups + anstehende Raids (analog Web-Dashboard).
 * Fokus: viele Icons, wenig Text, Links zum Signup/Edit/Plan.
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

function isEphemeralContext(interaction) {
  return interaction.guildId != null;
}

function fmtDateTime(locale, iso) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', month: '2-digit' }).format(d);
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(d);
  return `${day} ${time}`;
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
  if (x === 'normal' || x === 'main') return '✍️';
  return '•';
}

function buildDashboardEmbeds(payload) {
  const accent = 0x3b82f6;
  const locale = 'de';

  const top = new EmbedBuilder().setColor(accent).setTitle('🏠 RaidFlow Home').setTimestamp(new Date());

  if (!payload?.linked) {
    top.setDescription('🔒 Bitte einmal in der Webapp mit Discord anmelden.');
    return [top];
  }

  const s = payload.stats || { signupCount: 0, confirmedCount: 0, reserveCount: 0, uncertainCount: 0 };
  top.addFields({
    name: '📌 Meine Stats',
    value: `✍️ ${s.signupCount}  •  ✅ ${s.confirmedCount}  •  🪑 ${s.reserveCount}  •  ❓ ${s.uncertainCount}`,
    inline: false,
  });

  const signups = new EmbedBuilder().setColor(accent).setTitle('✍️ Meine Anmeldungen');
  const rows = payload.mySignups || [];
  if (rows.length === 0) {
    signups.setDescription('_Keine anstehenden Anmeldungen._');
  } else {
    const lines = rows.slice(0, 10).map((r) => {
      const when = fmtDateTime(locale, r.scheduledAtIso);
      const place = placementIcon(r.leaderPlacement);
      const typ = typeIcon(r.type);
      const confirm = r.setConfirmed ? '✅' : '';
      const ch = r.signedCharacterName ? `👤 ${r.signedCharacterName}` : '👤 —';
      const sp = r.signedSpec ? `🎯 ${r.signedSpec}` : '';
      const link = r.links?.signup ? `[🛠️](${r.links.signup})` : '';
      return `${place}${confirm}${typ} **${when}** · 🗺️ ${r.dungeonName} · ${ch}${sp ? ` · ${sp}` : ''} ${link}`.trim();
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
      const signup = r.links?.signup ? `[✍️](${r.links.signup})` : '';
      const edit = r.links?.edit ? `[⚙️](${r.links.edit})` : '';
      const plan = r.links?.plan ? `[🧩](${r.links.plan})` : '';
      return `${st} **${when}** · 🗺️ ${r.dungeonName} · ${counts} ${signup} ${edit} ${plan}`.trim();
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

function buildDashboardRows(payload) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rf_home_refresh').setLabel('🔄').setStyle(ButtonStyle.Secondary)
  );

  if (payload?.links?.dashboard) {
    row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('📊').setURL(payload.links.dashboard));
  }
  if (payload?.links?.profile) {
    row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('👤').setURL(payload.links.profile));
  }
  if (payload?.links?.newRaid) {
    row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('➕').setURL(payload.links.newRaid));
  }

  return [row];
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
      components: buildDashboardRows(payload),
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
      const payload = await fetchUserHome(getWebappJson, uid);
      await interaction.editReply({
        embeds: buildDashboardEmbeds(payload),
        components: buildDashboardRows(payload),
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

