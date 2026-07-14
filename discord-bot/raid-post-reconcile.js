/**
 * Stiller Hintergrund-Abgleich: Discord-Raid-Post-Embed ↔ Backend-Snapshot.
 * Aktualisiert Raidkanal und (falls vorhanden) Gastkanal.
 */

const RECONCILE_MAX_ATTEMPTS = 24;
const RECONCILE_DELAY_MS = 500;

/** @type {Map<string, { running: boolean, pending: boolean }>} */
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

/**
 * @param {import('discord.js').Client} client
 * @param {{ channelId?: string, messageId?: string | null, embeds?: unknown[], fingerprint?: string } | null | undefined} target
 */
async function reconcilePostTarget(client, target) {
  if (!target?.channelId || !target?.messageId || !target?.fingerprint || !Array.isArray(target.embeds)) {
    return true;
  }

  try {
    const channel = await client.channels.fetch(target.channelId);
    if (!channel?.isTextBased?.()) return true;
    const message = await channel.messages.fetch(target.messageId);
    const currentFingerprint = fingerprintDiscordEmbeds(message.embeds);
    if (currentFingerprint === target.fingerprint) return true;

    const components = message.components?.length ? message.components : undefined;
    await message
      .edit({
        embeds: target.embeds,
        ...(components ? { components } : {}),
      })
      .catch(() => {});
    return false;
  } catch {
    return true;
  }
}

async function runReconcileLoop(client, getWebappJson, raidId) {
  for (let attempt = 0; attempt < RECONCILE_MAX_ATTEMPTS; attempt += 1) {
    const state = reconcileState.get(raidId);
    if (!state?.running) return;

    state.pending = false;

    const snapshot = await fetchDisplaySnapshot(getWebappJson, raidId);
    if (!snapshot?.fingerprint || !Array.isArray(snapshot.embeds)) break;

    const mainDone = await reconcilePostTarget(client, snapshot);
    const guestDone = snapshot.guest
      ? await reconcilePostTarget(client, snapshot.guest)
      : true;

    if (mainDone && guestDone) break;

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
 * Startet (oder verlängert) den stillen Embed-Abgleich für Raid- und Gast-Post.
 * @param {import('discord.js').Client} client
 * @param {(path: string, queryParams: Record<string, string>) => Promise<unknown>} getWebappJson
 * @param {string} raidId
 */
export function scheduleRaidPostReconcile(client, getWebappJson, raidId) {
  if (!raidId) return;

  let state = reconcileState.get(raidId);
  if (!state) {
    state = { running: false, pending: false };
    reconcileState.set(raidId, state);
  }

  state.pending = true;

  if (!state.running) {
    state.running = true;
    void runReconcileLoop(client, getWebappJson, raidId);
  }
}
