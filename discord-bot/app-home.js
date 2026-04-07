/**
 * App Home / Profil-Dashboard: Embeds + Komponenten zum Anlegen von Charakteren (wie Web-Profil).
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { getSpecDisplayName, getSpecsForClass, TBC_CLASSES } from './tbc-specs.js';

const HOME_STATE_TTL_MS = 15 * 60 * 1000;
const homeState = new Map();

function homeKey(userId) {
  return String(userId);
}

function getHomeState(userId) {
  const entry = homeState.get(homeKey(userId));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    homeState.delete(homeKey(userId));
    return null;
  }
  return entry.data;
}

function setHomeState(userId, data) {
  homeState.set(homeKey(userId), { data, expiresAt: Date.now() + HOME_STATE_TTL_MS });
}

function clearHomeState(userId) {
  homeState.delete(homeKey(userId));
}

function isEphemeralContext(interaction) {
  return interaction.guildId != null;
}

function buildDashboardEmbeds(payload) {
  const accent = 0x3b82f6;
  const main = new EmbedBuilder()
    .setColor(accent)
    .setTitle('RaidFlow – Mein Profil')
    .setDescription(
      payload.linked
        ? 'Übersicht deiner Charaktere (wie im Web-Profil). Über **Charakter anlegen** fügst du einen Eintrag ohne Battle.net hinzu.'
        : 'Dein Discord-Konto ist noch **nicht** mit RaidFlow verknüpft. Melde dich einmal in der Webapp mit Discord an – danach kannst du hier Charaktere verwalten.'
    )
    .setTimestamp(new Date());

  if (payload.profileUrl) {
    main.addFields({ name: 'Web-Profil', value: `[Öffnen](${payload.profileUrl})`, inline: true });
  }

  if (payload.linked && payload.guilds?.length) {
    const gText = payload.guilds
      .slice(0, 8)
      .map((g) => `• ${g.name}`)
      .join('\n');
    main.addFields({
      name: `Deine Gilden (${payload.guilds.length})`,
      value: gText || '—',
      inline: false,
    });
  }

  const listEmbed = new EmbedBuilder().setColor(accent).setTitle('Charaktere');

  if (!payload.linked) {
    listEmbed.setDescription('_Keine Daten – zuerst Webapp-Login._');
    return [main, listEmbed];
  }

  const chars = payload.characters || [];
  if (chars.length === 0) {
    listEmbed.setDescription('Noch keine Charaktere. Nutze **Charakter anlegen**.');
  } else {
    const lines = chars.slice(0, 12).map((c, i) => {
      const gs = c.gearScore != null ? ` · GS ${c.gearScore}` : '';
      const g = c.guildName ? ` · ${c.guildName}` : '';
      const b = c.hasBattlenet ? ' · BNet' : '';
      return `**${i + 1}.** ${c.name} · ${c.mainSpec}${g}${gs}${b}`;
    });
    let desc = lines.join('\n');
    if (chars.length > 12) {
      desc += `\n_… und ${chars.length - 12} weitere (siehe Web-Profil)._`;
    }
    listEmbed.setDescription(desc.slice(0, 4000));
  }

  return [main, listEmbed];
}

function buildDashboardRows(linked) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('rf_home_refresh')
        .setLabel('Aktualisieren')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('rf_home_add_start')
        .setLabel('Charakter anlegen')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(linked !== true)
    ),
  ];
}

function buildClassSelectRow() {
  const options = TBC_CLASSES.map((c) =>
    new StringSelectMenuOptionBuilder().setLabel(c.name).setDescription(c.id).setValue(c.id)
  );
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('rf_home_pick_class')
      .setPlaceholder('Klasse wählen')
      .addOptions(options)
  );
}

function buildSpecSelectRow(classId) {
  const specs = getSpecsForClass(classId);
  const options = specs.map((s) => {
    const dn = getSpecDisplayName(classId, s.id);
    return new StringSelectMenuOptionBuilder()
      .setLabel(dn.length > 100 ? dn.slice(0, 97) + '…' : dn)
      .setValue(dn);
  });
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`rf_home_pick_spec:${classId}`)
      .setPlaceholder('Spezialisierung wählen')
      .addOptions(options)
  );
}

function buildGuildSelectRow(guilds) {
  const options = [
    new StringSelectMenuOptionBuilder().setLabel('Keine Gilde').setValue('rf_guild_none'),
    ...guilds.slice(0, 24).map((g) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(g.name.length > 100 ? g.name.slice(0, 97) + '…' : g.name)
        .setValue(g.id)
    ),
  ];
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('rf_home_pick_guild')
      .setPlaceholder('Gilde zuordnen (optional)')
      .addOptions(options)
  );
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
    const embeds = buildDashboardEmbeds(payload);
    const components = buildDashboardRows(payload.linked);
    await interaction.editReply({ embeds, components });
  } catch (e) {
    const msg = `Profil-Daten konnten nicht geladen werden: ${e.message}`;
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

  if (interaction.isButton()) {
    const id = interaction.customId;
    if (id === 'rf_home_refresh') {
      await interaction.deferUpdate().catch(() => {});
      try {
        const payload = await fetchUserHome(getWebappJson, uid);
        await interaction.editReply({
          embeds: buildDashboardEmbeds(payload),
          components: buildDashboardRows(payload.linked),
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
    if (id === 'rf_home_add_start') {
      const modal = new ModalBuilder()
        .setCustomId('rf_home_modal_name')
        .setTitle('Neuer Charakter')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('char_name')
              .setLabel('Charaktername (wie im Spiel)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMinLength(2)
              .setMaxLength(12)
          )
        );
      await interaction.showModal(modal);
      return true;
    }
    if (id === 'rf_home_cancel_flow') {
      clearHomeState(uid);
      await interaction.deferUpdate().catch(() => {});
      try {
        const payload = await fetchUserHome(getWebappJson, uid);
        await interaction.editReply({
          embeds: buildDashboardEmbeds(payload),
          components: buildDashboardRows(payload.linked),
        });
      } catch (e) {
        await interaction.editReply({
          content: `Abgebrochen. ${e.message}`,
          embeds: [],
          components: [],
        }).catch(() => {});
      }
      return true;
    }
    return false;
  }

  if (interaction.isStringSelectMenu()) {
    const customId = interaction.customId;

    if (customId === 'rf_home_pick_class') {
      const classId = interaction.values[0];
      const state = getHomeState(uid);
      if (!state?.pendingName) {
        await interaction.reply({ content: 'Sitzung abgelaufen. Bitte erneut **Charakter anlegen**.', ephemeral: true }).catch(() => {});
        return true;
      }
      await interaction.update({
        content: `**${state.pendingName}** – wähle die Spezialisierung.`,
        embeds: [],
        components: [
          buildSpecSelectRow(classId),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('rf_home_cancel_flow')
              .setLabel('Abbrechen')
              .setStyle(ButtonStyle.Danger)
          ),
        ],
      });
      return true;
    }

    if (customId.startsWith('rf_home_pick_spec:')) {
      const classId = customId.split(':')[1];
      const mainSpec = interaction.values[0];
      const state = getHomeState(uid);
      if (!state?.pendingName || !classId) {
        await interaction.reply({ content: 'Sitzung abgelaufen.', ephemeral: true }).catch(() => {});
        return true;
      }

      let guilds = [];
      try {
        const payload = await fetchUserHome(getWebappJson, uid);
        guilds = payload.guilds || [];
      } catch {
        /* unten Fehler */
      }

      setHomeState(uid, { pendingName: state.pendingName, mainSpec });

      if (guilds.length === 0) {
        await interaction.deferUpdate().catch(() => {});
        try {
          await callWebapp('/api/bot/user-character', {
            discordUserId: uid,
            name: state.pendingName,
            mainSpec,
            guildId: null,
          });
          clearHomeState(uid);
          const payload = await fetchUserHome(getWebappJson, uid);
          await interaction.editReply({
            content: `Charakter **${state.pendingName}** wurde angelegt.`,
            embeds: buildDashboardEmbeds(payload),
            components: buildDashboardRows(payload.linked),
          });
        } catch (e) {
          clearHomeState(uid);
          await interaction.editReply({
            content: `Speichern fehlgeschlagen: ${e.message}`,
            embeds: [],
            components: buildDashboardRows(true),
          }).catch(() => {});
        }
        return true;
      }

      await interaction.update({
        content: `**${state.pendingName}** · ${mainSpec} – Gilden-Zuordnung?`,
        embeds: [],
        components: [
          buildGuildSelectRow(guilds),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('rf_home_cancel_flow')
              .setLabel('Abbrechen')
              .setStyle(ButtonStyle.Danger)
          ),
        ],
      });
      return true;
    }

    if (customId === 'rf_home_pick_guild') {
      const raw = interaction.values[0];
      const guildId = raw === 'rf_guild_none' ? null : raw;
      const state = getHomeState(uid);
      if (!state?.pendingName || !state.mainSpec) {
        await interaction.reply({ content: 'Sitzung abgelaufen.', ephemeral: true }).catch(() => {});
        return true;
      }

      await interaction.deferUpdate().catch(() => {});
      try {
        await callWebapp('/api/bot/user-character', {
          discordUserId: uid,
          name: state.pendingName,
          mainSpec: state.mainSpec,
          guildId,
        });
        clearHomeState(uid);
        const payload = await fetchUserHome(getWebappJson, uid);
        await interaction.editReply({
          content: `Charakter **${state.pendingName}** wurde angelegt.`,
          embeds: buildDashboardEmbeds(payload),
          components: buildDashboardRows(payload.linked),
        });
      } catch (e) {
        clearHomeState(uid);
        await interaction.editReply({
          content: `Speichern fehlgeschlagen: ${e.message}`,
          embeds: [],
          components: buildDashboardRows(true),
        }).catch(() => {});
      }
      return true;
    }

    return false;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'rf_home_modal_name') {
    const name = interaction.fields.getTextInputValue('char_name').trim();
    if (!name) {
      await interaction.reply({ content: 'Bitte einen Namen eingeben.', ephemeral: true }).catch(() => {});
      return true;
    }
    setHomeState(uid, { pendingName: name });
    const ephemeral = isEphemeralContext(interaction);
    await interaction.reply({
      content: `**${name}** – wähle die Klasse.`,
      embeds: [],
      components: [
        buildClassSelectRow(),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('rf_home_cancel_flow')
            .setLabel('Abbrechen')
            .setStyle(ButtonStyle.Danger)
        ),
      ],
      ephemeral,
    });
    return true;
  }

  return false;
}
