/**
 * Stiller Hintergrund-Abgleich: Discord-Raid-Post-Embed ↔ Backend-Snapshot.
 * Keine User-Rückmeldung, kein Logging.
 */

const RECONCILE_MAX_ATTEMPTS = 24;
const RECONCILE_DELAY_MS = 500;

/** @type {Map<string, { running: boolean, pending: boolean, message: import('discord.js').Message | null }>} */
const reconcileState = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fingerprintDiscordEmbeds(embeds) {
  const norm = embeds.map((embed) => {
    const data = embed.data ?? embed;
    return {
      t: data.title ?? '',
      d: data.description ?? '',
      f: (data.fields ?? []).map((field) => `${field.name}\u0001${field.value}`),
      ft: data.footer?.text ?? '',
      c: data.color ?? 0,
    };
  });
  return JSON.stringify(norm);
}

async function fetchDisplaySnapshot(getWebappJson, raidId) {
  try {
    return await getWebappJson('/api/bot/discord-action', {
      action: 'get-raid-display',
      raidId,
    });
  } catch {
    return null;
  }
}

async function resolveRaidPostMessage(client, state, snapshot) {
  if (state.message) return state.message;
  if (!snapshot?.channelId || !snapshot?.messageId) return null;
  try {
    const channel = await client.channels.fetch(snapshot.channelId);
    if (!channel?.isTextBased?.()) return null;
    const message = await channel.messages.fetch(snapshot.messageId);
    state.message = message;
    return message;
  } catch {
    return null;
  }
}

async function runReconcileLoop(client, getWebappJson, raidId) {
  for (let attempt = 0; attempt < RECONCILE_MAX_ATTEMPTS; attempt += 1) {
    const state = reconcileState.get(raidId);
    if (!state?.running) return;

    state.pending = false;

    const snapshot = await fetchDisplaySnapshot(getWebappJson, raidId);
    if (!snapshot?.fingerprint || !Array.isArray(snapshot.embeds)) break;

    const message = await resolveRaidPostMessage(client, state, snapshot);
    if (!message) break;

    const currentFingerprint = fingerprintDiscordEmbeds(message.embeds);
    if (currentFingerprint === snapshot.fingerprint) break;

    const components = message.components?.length ? message.components : undefined;
    await message
      .edit({
        embeds: snapshot.embeds,
        ...(components ? { components } : {}),
      })
      .catch(() => {});

    await sleep(RECONCILE_DELAY_MS);
  }

  const state = reconcileState.get(raidId);
  if (!state) return;

  state.running = false;
  if (state.pending) {
    state.running = true;
    void runReconcileLoop(client, getWebappJson, raidId);
  } else {
    reconcileState.delete(raidId);
  }
}

/**
 * Startet (oder verlängert) den stillen Embed-Abgleich für einen Raid-Post.
 * @param {import('discord.js').Client} client
 * @param {(path: string, queryParams: Record<string, string>) => Promise<unknown>} getWebappJson
 * @param {string} raidId
 * @param {import('discord.js').Message | null | undefined} message
 */
export function scheduleRaidPostReconcile(client, getWebappJson, raidId, message) {
  if (!raidId) return;

  let state = reconcileState.get(raidId);
  if (!state) {
    state = { running: false, pending: false, message: null };
    reconcileState.set(raidId, state);
  }

  if (message) state.message = message;
  state.pending = true;

  if (!state.running) {
    state.running = true;
    void runReconcileLoop(client, getWebappJson, raidId);
  }
}
