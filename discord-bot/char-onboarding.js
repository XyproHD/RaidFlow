/**
 * Discord Charakter-Onboarding: Anlage per Bot bei Quickjoin/Anmelden ohne WebApp-Login.
 * Eine ephemere Nachricht, Status via editReply; BNet/Create async (fire-and-forget).
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { raidBotMessage } from './raid-bot-i18n.js';
import {
  battlenetClassNameToTbcClassId,
  getSpecByDisplayName,
  getSpecDisplayName,
  getSpecsForClass,
} from './tbc-specs.js';

export const CHAR_ONBOARD_TTL_MS = 10 * 60 * 1000;

const charOnboardingState = new Map();

function coKey(userId) {
  return String(userId);
}

export function getCharOnboardingFlow(userId) {
  const entry = charOnboardingState.get(coKey(userId));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    charOnboardingState.delete(coKey(userId));
    return null;
  }
  return entry.data;
}

function setCharOnboardingFlow(userId, data) {
  charOnboardingState.set(coKey(userId), {
    data,
    expiresAt: Date.now() + CHAR_ONBOARD_TTL_MS,
  });
}

export function clearCharOnboardingFlow(userId) {
  charOnboardingState.delete(coKey(userId));
}

function raidNoDash(raidId) {
  return raidId.replace(/-/g, '');
}

function truncateLabel(s, maxLen = 100) {
  const t = String(s ?? '').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

function formatMsg(locale, key, vars = {}) {
  let s = raidBotMessage(locale, key);
  for (const [k, v] of Object.entries(vars)) {
    s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v ?? ''));
  }
  return s;
}

async function postWebappJson(path, body, getWebappHeaders) {
  const base = (process.env.WEBAPP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getWebappHeaders() },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { error: text || `HTTP ${res.status}` };
  }
  return { ok: res.ok, status: res.status, json };
}

function buildNameStepComponents(raidId, locale) {
  const nd = raidNoDash(raidId);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`rf:co:open:${nd}`)
        .setLabel(formatMsg(locale, 'CO_BTN_NAME'))
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`rf:co:cancel:${nd}`)
        .setLabel(formatMsg(locale, 'CO_BTN_CANCEL'))
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildBnetFailComponents(raidId, locale) {
  const nd = raidNoDash(raidId);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`rf:co:open:${nd}`)
        .setLabel(formatMsg(locale, 'CO_BTN_RETRY'))
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`rf:co:cancel:${nd}`)
        .setLabel(formatMsg(locale, 'CO_BTN_CANCEL'))
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildSpecStepComponents(raidId, flow) {
  const nd = raidNoDash(raidId);
  const locale = flow.locale ?? 'de';
  const specs = getSpecsForClass(flow.classId);
  const mainOptions = specs.map((s) => ({
    label: truncateLabel(getSpecDisplayName(flow.classId, s.id), 100),
    value: s.id,
  }));
  const offOptions = [
    { label: formatMsg(locale, 'CO_OFF_NONE'), value: '__none__' },
    ...mainOptions.map((o) => ({ ...o })),
  ];

  const rows = [];
  rows.push(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rf:cospec:main:${nd}`)
        .setPlaceholder(formatMsg(locale, 'CO_MAIN_PLACEHOLDER'))
        .addOptions(mainOptions.slice(0, 25)),
    ),
  );
  rows.push(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rf:cospec:off:${nd}`)
        .setPlaceholder(formatMsg(locale, 'CO_OFF_PLACEHOLDER'))
        .addOptions(offOptions.slice(0, 25)),
    ),
  );
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`rf:co:confirm:${nd}`)
        .setLabel(formatMsg(locale, 'CO_BTN_CONFIRM'))
        .setStyle(ButtonStyle.Success)
        .setDisabled(!flow.mainSpecId),
      new ButtonBuilder()
        .setCustomId(`rf:co:cancel:${nd}`)
        .setLabel(formatMsg(locale, 'CO_BTN_CANCEL'))
        .setStyle(ButtonStyle.Secondary),
    ),
  );
  return rows;
}

function buildIntroContent(flow) {
  const locale = flow.locale ?? 'de';
  return [
    formatMsg(locale, 'CO_INTRO'),
    '',
    formatMsg(locale, 'CO_STATUS_INTRO'),
    '',
    formatMsg(locale, 'CO_NAME_HINT'),
  ].join('\n');
}

function buildBnetLoadingContent(flow) {
  const locale = flow.locale ?? 'de';
  return formatMsg(locale, 'CO_STATUS_BNET', { name: flow.characterName ?? '?' });
}

function buildSpecStepContent(flow) {
  const locale = flow.locale ?? 'de';
  const p = flow.battlenetProfile ?? {};
  return formatMsg(locale, 'CO_STATUS_SPEC', {
    name: flow.characterName ?? p.characterNameLower ?? '?',
    className: p.className ?? flow.classId ?? '?',
    level: p.level ?? '?',
  });
}

function buildBnetFailContent(flow, detail) {
  const locale = flow.locale ?? 'de';
  let text = [formatMsg(locale, 'CO_BNET_FAIL_TITLE'), '', formatMsg(locale, 'CO_BNET_FAIL_HINTS')].join('\n');
  if (detail) {
    text += formatMsg(locale, 'CO_BNET_FAIL_DETAIL', { detail });
  }
  return text;
}

function buildCharNameModal(raidId, locale) {
  const nd = raidNoDash(raidId);
  const modal = new ModalBuilder()
    .setCustomId(`rfm:coname:${nd}`)
    .setTitle(formatMsg(locale, 'CO_MODAL_TITLE'));
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('charname')
        .setLabel(formatMsg(locale, 'CO_MODAL_LABEL'))
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(12)
        .setPlaceholder(formatMsg(locale, 'CO_MODAL_PLACEHOLDER')),
    ),
  );
  return modal;
}

/**
 * Startet Onboarding statt NO_CHARACTER-Fehler.
 * @returns {Promise<boolean>} true wenn Flow gestartet oder Fehler angezeigt
 */
export async function startCharOnboarding(interaction, raidId, json, opts, deps) {
  const locale = opts.locale ?? 'de';
  const purpose = opts.assignPurpose;
  if (purpose !== 'qj' && purpose !== 'join') return false;

  const realmId = json.battlenetRealmId?.trim?.() ?? json.battlenetRealmId ?? '';
  if (!realmId) {
    if (opts.raidPostMsg && opts.raidPostOrig?.length) {
      await deps.restoreRaidPostComponents(opts.raidPostMsg, opts.raidPostOrig);
    }
    await interaction.editReply({
      content: formatMsg(locale, 'CO_NO_REALM'),
      components: [],
    }).catch(() => {});
    deps.scheduleDeleteSingleEphemeralReply(interaction);
    return true;
  }

  setCharOnboardingFlow(interaction.user.id, {
    raidId,
    purpose,
    guildId: json.raidGuildId,
    realmId,
    locale,
    isRaidGuildMember: json.isRaidGuildMember === true,
    guestEligible: json.guestEligible === true,
    step: 'name',
    characterName: '',
    battlenetProfile: null,
    classId: '',
    mainSpecId: '',
    offSpecId: '',
    discordGuestChannelId: json.discordGuestChannelId ?? null,
  });

  if (opts.raidPostMsg && opts.raidPostOrig?.length) {
    await deps.restoreRaidPostComponents(opts.raidPostMsg, opts.raidPostOrig);
  }

  await interaction.editReply({
    content: buildIntroContent(getCharOnboardingFlow(interaction.user.id)),
    components: buildNameStepComponents(raidId, locale),
  }).catch(() => {});

  return true;
}

export async function handleCharOnboardingOpenModal(interaction, raidId) {
  const flow = getCharOnboardingFlow(interaction.user.id);
  if (!flow || flow.raidId !== raidId) {
    await interaction.reply({
      content: formatMsg('de', 'CO_SESSION_EXPIRED'),
      ephemeral: true,
    }).catch(() => {});
    return;
  }
  await interaction.showModal(buildCharNameModal(raidId, flow.locale ?? 'de')).catch(() => {});
}

export async function handleCharOnboardingCancel(interaction, raidId, deps) {
  const flow = getCharOnboardingFlow(interaction.user.id);
  const locale = flow?.locale ?? 'de';
  clearCharOnboardingFlow(interaction.user.id);
  await interaction.deferUpdate().catch(() => {});
  await interaction.message?.edit({
    content: formatMsg(locale, 'CO_CANCELLED'),
    components: [],
  }).catch(() => {
    interaction.editReply({ content: formatMsg(locale, 'CO_CANCELLED'), components: [] }).catch(() => {});
  });
  deps.scheduleDeleteSingleEphemeralReply(interaction);
}

export async function handleCharOnboardingNameModal(interaction, raidId, deps) {
  const flow = getCharOnboardingFlow(interaction.user.id);
  if (!flow || flow.raidId !== raidId) {
    await interaction.reply({
      content: formatMsg('de', 'CO_SESSION_EXPIRED'),
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  const name = interaction.fields.getTextInputValue('charname').trim();
  if (!name) {
    await interaction.reply({
      content: formatMsg(flow.locale ?? 'de', 'CO_PICK_MAIN'),
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  flow.characterName = name;
  flow.step = 'bnet_loading';
  setCharOnboardingFlow(interaction.user.id, flow);

  await interaction.deferUpdate().catch(() => {});
  const msg = interaction.message;
  if (msg) {
    await msg.edit({
      content: buildBnetLoadingContent(flow),
      components: [],
    }).catch(() => {});
  }

  void runBnetResolve(interaction.user.id, msg, flow, deps);
}

async function runBnetResolve(userId, message, flow, deps) {
  const locale = flow.locale ?? 'de';
  try {
    const { ok, json } = await postWebappJson(
      '/api/bot/battlenet/resolve-character',
      {
        realmId: flow.realmId,
        characterName: flow.characterName,
        appLocale: locale,
      },
      deps.getWebappHeaders,
    );

    const current = getCharOnboardingFlow(userId);
    if (!current || current.step !== 'bnet_loading') return;

    if (!ok || !json.ok) {
      current.step = 'bnet_fail';
      setCharOnboardingFlow(userId, current);
      const detail = typeof json.error === 'string' ? json.error : '';
      if (message) {
        await message.edit({
          content: buildBnetFailContent(current, detail),
          components: buildBnetFailComponents(current.raidId, locale),
        }).catch(() => {});
      }
      return;
    }

    const classId = battlenetClassNameToTbcClassId(json.profile?.className);
    if (!classId) {
      current.step = 'bnet_fail';
      setCharOnboardingFlow(userId, current);
      if (message) {
        await message.edit({
          content: buildBnetFailContent(current, 'Class could not be mapped.'),
          components: buildBnetFailComponents(current.raidId, locale),
        }).catch(() => {});
      }
      return;
    }

    current.battlenetProfile = json.profile;
    current.classId = classId;
    current.step = 'spec';

    const bnetMain = json.mainSpec ?? json.profile?.activeSpecName ?? '';
    const parsed = bnetMain ? getSpecByDisplayName(bnetMain) : null;
    if (parsed && parsed.classId === classId) {
      current.mainSpecId = parsed.specId;
    }

    setCharOnboardingFlow(userId, current);

    if (message) {
      await message.edit({
        content: buildSpecStepContent(current),
        components: buildSpecStepComponents(current.raidId, current),
      }).catch(() => {});
    }
  } catch (err) {
    const current = getCharOnboardingFlow(userId);
    if (!current) return;
    current.step = 'bnet_fail';
    setCharOnboardingFlow(userId, current);
    const detail = err instanceof Error ? err.message : String(err);
    if (message) {
      await message.edit({
        content: buildBnetFailContent(current, detail),
        components: buildBnetFailComponents(current.raidId, locale),
      }).catch(() => {});
    }
  }
}

export async function handleCharOnboardingSpecSelect(interaction, raidId, kind) {
  const flow = getCharOnboardingFlow(interaction.user.id);
  if (!flow || flow.raidId !== raidId) {
    await interaction.reply({
      content: formatMsg('de', 'CO_SESSION_EXPIRED'),
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  const value = interaction.values?.[0];
  if (!value) return;

  if (kind === 'main') {
    flow.mainSpecId = value;
  } else if (kind === 'off') {
    flow.offSpecId = value === '__none__' ? '' : value;
  }
  setCharOnboardingFlow(interaction.user.id, flow);

  await interaction.update({
    content: buildSpecStepContent(flow),
    components: buildSpecStepComponents(raidId, flow),
  }).catch(() => {});
}

export async function handleCharOnboardingConfirm(interaction, raidId, deps) {
  const flow = getCharOnboardingFlow(interaction.user.id);
  const locale = flow?.locale ?? 'de';
  if (!flow || flow.raidId !== raidId) {
    await interaction.reply({
      content: formatMsg(locale, 'CO_SESSION_EXPIRED'),
      ephemeral: true,
    }).catch(() => {});
    return;
  }
  if (!flow.mainSpecId) {
    await interaction.reply({
      content: formatMsg(locale, 'CO_PICK_MAIN'),
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  flow.step = 'creating';
  setCharOnboardingFlow(interaction.user.id, flow);

  await interaction.deferUpdate().catch(() => {});
  const msg = interaction.message;
  if (msg) {
    await msg.edit({
      content: formatMsg(locale, 'CO_STATUS_CREATING'),
      components: [],
    }).catch(() => {});
  }

  void createCharAndResume(interaction, msg, flow, deps);
}

async function createCharAndResume(interaction, message, flow, deps) {
  const locale = flow.locale ?? 'de';
  const userId = interaction.user.id;

  try {
    const mainSpec = getSpecDisplayName(flow.classId, flow.mainSpecId);
    const offSpec = flow.offSpecId
      ? getSpecDisplayName(flow.classId, flow.offSpecId)
      : null;

    const body = {
      discordUserId: userId,
      battlenetProfile: flow.battlenetProfile,
      name: flow.characterName,
      mainSpec,
      offSpec,
      isMain: flow.isRaidGuildMember,
      guestOnboarding: flow.guestEligible && !flow.isRaidGuildMember,
    };

    const { ok, json } = await postWebappJson(
      `/api/bot/guilds/${flow.guildId}/characters`,
      body,
      deps.getWebappHeaders,
    );

    const current = getCharOnboardingFlow(userId);
    if (!current) return;

    if (!ok) {
      const detail = typeof json.error === 'string' ? json.error : 'Unknown error';
      if (message) {
        await message.edit({
          content: formatMsg(locale, 'CO_CREATE_FAIL', { detail }),
          components: buildBnetFailComponents(flow.raidId, locale),
        }).catch(() => {});
      }
      current.step = 'spec';
      setCharOnboardingFlow(userId, current);
      return;
    }

    clearCharOnboardingFlow(userId);

    await resumeOriginalRaidAction(interaction, message, flow, deps);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (message) {
      await message.edit({
        content: formatMsg(locale, 'CO_CREATE_FAIL', { detail }),
        components: buildBnetFailComponents(flow.raidId, locale),
      }).catch(() => {});
    }
  }
}

async function resumeOriginalRaidAction(interaction, message, flow, deps) {
  const { ok, json } = await deps.fetchRaidParticipantState(interaction, flow.raidId);
  const locale = ok ? deps.botLocale(interaction, json) : flow.locale ?? 'de';

  if (!ok || !json.guildMember) {
    const errText = `❌ ${deps.raidBotMessage(locale, 'BACKEND_FAILED')}`;
    if (message) {
      await message.edit({ content: errText, components: [] }).catch(() => {});
    } else {
      await interaction.editReply({ content: errText, components: [] }).catch(() => {});
    }
    deps.scheduleDeleteSingleEphemeralReply(interaction);
    return;
  }

  if (flow.purpose === 'qj') {
    const raidPostMsg =
      deps.raidPostMessages?.get?.(`${interaction.user.id}:${flow.raidId}`) ?? null;

    const { ok: qjOk, json: qjJson } = await deps.callDiscordAction({
      action: 'quickjoin',
      discordUserId: interaction.user.id,
      raidId: flow.raidId,
      discordGuildId: interaction.guildId ?? '',
    }, interaction);

    const outcome = qjOk
      ? `⚡ ${qjJson.message ?? deps.raidBotMessage(locale, 'QUICKJOIN_OK')}`
      : deps.raidActionErrorText(qjJson.error, qjJson, locale);

    if (message) {
      await message.edit({ content: outcome, components: [] }).catch(() => {});
    } else {
      await interaction.editReply({ content: outcome, components: [] }).catch(() => {});
    }
    if (qjOk) deps.triggerRaidPostReconcile(flow.raidId, raidPostMsg);
    deps.scheduleDeleteSingleEphemeralReply(interaction);
    return;
  }

  if (flow.purpose === 'join') {
    await deps.continueRaidJoinFlow(
      interaction,
      flow.raidId,
      json.raidGuildId,
      json,
      locale,
    );
  }
}

export function isCharOnboardingButtonId(customId) {
  return customId.startsWith('rf:co:');
}

export function isCharOnboardingSelectId(customId) {
  return customId.startsWith('rf:cospec:');
}

export function isCharOnboardingModalId(customId) {
  return customId.startsWith('rfm:coname:');
}
