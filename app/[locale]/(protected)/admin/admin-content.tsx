'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

type GuildRow = { id: string; name: string; discordGuildId: string };
type ConfigState = {
  useWhitelist: boolean;
  useBlacklist: boolean;
  serverWhitelist: string[];
  serverBlacklist: string[];
  discordBotInviteEnabled: boolean;
  maintenanceMode: boolean;
  statusMessage: string;
};
type AdminRow = { discordUserId: string; addedByDiscordId: string | null; createdAt: string };
type DbProbeSample = { ms: number; at: string };

export function AdminContent({ locale, isOwner }: { locale: string; isOwner: boolean }) {
  const t = useTranslations('admin');
  const [guilds, setGuilds] = useState<GuildRow[]>([]);
  const [config, setConfig] = useState<ConfigState | null>(null);
  const [ownerDiscordId, setOwnerDiscordId] = useState<string | null>(null);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const [configUseWhitelist, setConfigUseWhitelist] = useState(false);
  const [configUseBlacklist, setConfigUseBlacklist] = useState(false);
  const [configWhitelistText, setConfigWhitelistText] = useState('');
  const [configBlacklistText, setConfigBlacklistText] = useState('');
  const [configDiscordBotInviteEnabled, setConfigDiscordBotInviteEnabled] = useState(true);
  const [configMaintenanceMode, setConfigMaintenanceMode] = useState(false);
  const [configStatusMessage, setConfigStatusMessage] = useState('');
  const [newAdminId, setNewAdminId] = useState('');
  const [deletingGuildId, setDeletingGuildId] = useState<string | null>(null);
  const [removingAdminId, setRemovingAdminId] = useState<string | null>(null);
  const [dbProbeRunning, setDbProbeRunning] = useState(false);
  const [dbProbeBusy, setDbProbeBusy] = useState(false);
  const [dbProbeSamples, setDbProbeSamples] = useState<DbProbeSample[]>([]);
  const [dbProbeError, setDbProbeError] = useState<string | null>(null);
  const [dbProbeFailureCount, setDbProbeFailureCount] = useState(0);
  const dbProbeTimerRef = useRef<number | null>(null);
  const dbProbeAbortRef = useRef<AbortController | null>(null);

  const loadGuilds = useCallback(async () => {
    const res = await fetch('/api/admin/guilds');
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    setGuilds(data.guilds ?? []);
  }, []);

  const loadConfig = useCallback(async () => {
    const res = await fetch('/api/admin/config');
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    setConfig(data);
    setConfigUseWhitelist(data.useWhitelist ?? false);
    setConfigUseBlacklist(data.useBlacklist ?? false);
    setConfigWhitelistText((data.serverWhitelist ?? []).join('\n'));
    setConfigBlacklistText((data.serverBlacklist ?? []).join('\n'));
    setConfigDiscordBotInviteEnabled(data.discordBotInviteEnabled !== false);
    setConfigMaintenanceMode(data.maintenanceMode ?? false);
    setConfigStatusMessage(data.statusMessage ?? '');
  }, []);

  const loadAdmins = useCallback(async () => {
    const res = await fetch('/api/admin/admins');
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    setOwnerDiscordId(data.ownerDiscordId ?? null);
    setAdmins(data.admins ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([loadGuilds(), loadConfig(), loadAdmins()]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadGuilds, loadConfig, loadAdmins]);

  const handleSaveConfig = async () => {
    setError(null);
    setSavedMessage(null);
    const serverWhitelist = configWhitelistText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const serverBlacklist = configBlacklistText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    let useWhitelist = configUseWhitelist;
    let useBlacklist = configUseBlacklist;
    if (useWhitelist && useBlacklist) useBlacklist = false;
    const res = await fetch('/api/admin/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        useWhitelist,
        useBlacklist,
        serverWhitelist,
        serverBlacklist,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? await res.text());
      return;
    }
    setSavedMessage(t('saved'));
    setTimeout(() => setSavedMessage(null), 3000);
    loadConfig();
  };

  const handleSaveFeatures = async () => {
    setError(null);
    setSavedMessage(null);
    const res = await fetch('/api/admin/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        discordBotInviteEnabled: configDiscordBotInviteEnabled,
        maintenanceMode: configMaintenanceMode,
        statusMessage: configStatusMessage,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? await res.text());
      return;
    }
    setSavedMessage(t('saved'));
    setTimeout(() => setSavedMessage(null), 3000);
    loadConfig();
  };

  const handleDeleteGuild = async (guildId: string, name: string) => {
    if (!confirm(t('deleteGuildConfirm', { name }))) return;
    setDeletingGuildId(guildId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/guilds/${guildId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? await res.text());
        return;
      }
      await loadGuilds();
    } finally {
      setDeletingGuildId(null);
    }
  };

  const handleAddAdmin = async () => {
    const id = newAdminId.trim();
    if (!id) return;
    setError(null);
    const res = await fetch('/api/admin/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discordUserId: id }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? await res.text());
      return;
    }
    setNewAdminId('');
    loadAdmins();
  };

  const handleRemoveAdmin = async (discordUserId: string) => {
    if (discordUserId === ownerDiscordId) return;
    setRemovingAdminId(discordUserId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/admins/${encodeURIComponent(discordUserId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? await res.text());
        return;
      }
      await loadAdmins();
    } finally {
      setRemovingAdminId(null);
    }
  };

  const clearDbProbeTimer = useCallback(() => {
    if (dbProbeTimerRef.current != null) {
      window.clearTimeout(dbProbeTimerRef.current);
      dbProbeTimerRef.current = null;
    }
  }, []);

  const stopDbProbe = useCallback(() => {
    setDbProbeRunning(false);
    clearDbProbeTimer();
    dbProbeAbortRef.current?.abort();
    dbProbeAbortRef.current = null;
    setDbProbeBusy(false);
  }, [clearDbProbeTimer]);

  const runDbProbeOnce = useCallback(async () => {
    if (!isOwner) return;
    dbProbeAbortRef.current?.abort();
    const ctrl = new AbortController();
    dbProbeAbortRef.current = ctrl;
    setDbProbeBusy(true);
    try {
      const res = await fetch('/api/admin/sysdiag/ping', {
        method: 'GET',
        cache: 'no-store',
        signal: ctrl.signal,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok !== true || typeof body?.ms !== 'number') {
        const err = typeof body?.error === 'string' ? body.error : await res.text();
        setDbProbeFailureCount((v) => v + 1);
        setDbProbeError(err || t('ownerDbProbeUnknownError'));
        return;
      }
      setDbProbeSamples((prev) => [...prev, { ms: body.ms, at: body.at ?? new Date().toISOString() }]);
      setDbProbeError(null);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setDbProbeFailureCount((v) => v + 1);
      setDbProbeError(e instanceof Error ? e.message : String(e));
    } finally {
      if (dbProbeAbortRef.current === ctrl) dbProbeAbortRef.current = null;
      setDbProbeBusy(false);
    }
  }, [isOwner, t]);

  const startDbProbe = useCallback(() => {
    if (!isOwner || dbProbeRunning) return;
    setDbProbeSamples([]);
    setDbProbeError(null);
    setDbProbeFailureCount(0);
    setDbProbeRunning(true);
  }, [isOwner, dbProbeRunning]);

  const resetDbProbe = useCallback(() => {
    stopDbProbe();
    setDbProbeSamples([]);
    setDbProbeError(null);
    setDbProbeFailureCount(0);
  }, [stopDbProbe]);

  useEffect(() => {
    if (!dbProbeRunning || !isOwner) return;
    let active = true;
    const loop = async () => {
      await runDbProbeOnce();
      if (!active) return;
      dbProbeTimerRef.current = window.setTimeout(loop, 1200);
    };
    void loop();
    return () => {
      active = false;
      clearDbProbeTimer();
      dbProbeAbortRef.current?.abort();
      dbProbeAbortRef.current = null;
      setDbProbeBusy(false);
    };
  }, [dbProbeRunning, isOwner, runDbProbeOnce, clearDbProbeTimer]);

  useEffect(() => () => stopDbProbe(), [stopDbProbe]);

  const dbProbeStats = useMemo(() => {
    if (dbProbeSamples.length === 0) return null;
    const values = dbProbeSamples.map((s) => s.ms);
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, value) => acc + value, 0);
    const percentile = (p: number) => {
      const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1));
      return sorted[idx];
    };
    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: Math.round(sum / values.length),
      p50: percentile(50),
      p95: percentile(95),
      last: values[values.length - 1],
      lastAt: dbProbeSamples[dbProbeSamples.length - 1]?.at ?? null,
    };
  }, [dbProbeSamples]);

  if (loading) {
    return (
      <div className="space-y-4">
        {isOwner && (
          <p className="text-sm text-muted-foreground">
            <Link
              href={`/${locale}/admin/sysdiag`}
              className="underline hover:text-foreground decoration-muted-foreground/60"
            >
              {t('ownerDiagnosticsLink')}
            </Link>
          </p>
        )}
        <p className="text-muted-foreground">{t('loading')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {isOwner && (
        <p className="text-sm text-muted-foreground -mt-2 mb-2">
          <Link
            href={`/${locale}/admin/sysdiag`}
            className="underline hover:text-foreground decoration-muted-foreground/60"
          >
            {t('ownerDiagnosticsLink')}
          </Link>
        </p>
      )}
      {isOwner && (
        <section className="space-y-3 rounded-lg border border-border p-4 bg-card/30">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t('ownerDbProbeTitle')}</h2>
              <p className="text-sm text-muted-foreground">{t('ownerDbProbeDescription')}</p>
            </div>
            <div className="text-xs text-muted-foreground">
              {dbProbeRunning ? t('ownerDbProbeRunning') : t('ownerDbProbeStopped')}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={startDbProbe}
              disabled={dbProbeRunning}
              className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {t('ownerDbProbeStart')}
            </button>
            <button
              type="button"
              onClick={stopDbProbe}
              disabled={!dbProbeRunning}
              className="px-3 py-1.5 rounded-md border border-border text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              {t('ownerDbProbeStop')}
            </button>
            <button
              type="button"
              onClick={resetDbProbe}
              disabled={dbProbeRunning || dbProbeBusy}
              className="px-3 py-1.5 rounded-md border border-border text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              {t('ownerDbProbeReset')}
            </button>
          </div>

          {dbProbeStats ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-sm">
              <div className="rounded-md border border-border p-2">
                <div className="text-xs text-muted-foreground">{t('ownerDbProbeSamples')}</div>
                <div className="font-semibold">{dbProbeStats.count}</div>
              </div>
              <div className="rounded-md border border-border p-2">
                <div className="text-xs text-muted-foreground">{t('ownerDbProbeLast')}</div>
                <div className="font-semibold">{dbProbeStats.last} ms</div>
              </div>
              <div className="rounded-md border border-border p-2">
                <div className="text-xs text-muted-foreground">{t('ownerDbProbeMin')}</div>
                <div className="font-semibold">{dbProbeStats.min} ms</div>
              </div>
              <div className="rounded-md border border-border p-2">
                <div className="text-xs text-muted-foreground">{t('ownerDbProbeAvg')}</div>
                <div className="font-semibold">{dbProbeStats.avg} ms</div>
              </div>
              <div className="rounded-md border border-border p-2">
                <div className="text-xs text-muted-foreground">{t('ownerDbProbeP50')}</div>
                <div className="font-semibold">{dbProbeStats.p50} ms</div>
              </div>
              <div className="rounded-md border border-border p-2">
                <div className="text-xs text-muted-foreground">{t('ownerDbProbeP95')}</div>
                <div className="font-semibold">{dbProbeStats.p95} ms</div>
              </div>
              <div className="rounded-md border border-border p-2">
                <div className="text-xs text-muted-foreground">{t('ownerDbProbeMax')}</div>
                <div className="font-semibold">{dbProbeStats.max} ms</div>
              </div>
              <div className="rounded-md border border-border p-2">
                <div className="text-xs text-muted-foreground">{t('ownerDbProbeErrors')}</div>
                <div className="font-semibold">{dbProbeFailureCount}</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('ownerDbProbeNoSamples')}</p>
          )}

          {dbProbeStats?.lastAt && (
            <p className="text-xs text-muted-foreground">
              {t('ownerDbProbeLastAt')}: {new Date(dbProbeStats.lastAt).toLocaleString()}
            </p>
          )}
          {dbProbeError && (
            <p className="text-sm text-destructive" role="alert">
              {t('ownerDbProbeLastError')}: {dbProbeError}
            </p>
          )}
        </section>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {t('error')}: {error}
        </p>
      )}
      {savedMessage && (
        <p className="text-sm text-green-600 dark:text-green-400" role="status">
          {savedMessage}
        </p>
      )}

      {/* Gilden löschen */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">{t('guildsSection')}</h2>
        <p className="text-sm text-muted-foreground">{t('guildsSectionDescription')}</p>
        {guilds.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noGuilds')}</p>
        ) : (
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">{t('guildName')}</th>
                  <th className="text-left p-2 font-medium">{t('guildDiscordId')}</th>
                  <th className="w-24 p-2" />
                </tr>
              </thead>
              <tbody>
                {guilds.map((g) => (
                  <tr key={g.id} className="border-t border-border">
                    <td className="p-2">{g.name}</td>
                    <td className="p-2 font-mono text-xs">{g.discordGuildId}</td>
                    <td className="p-2">
                      <button
                        type="button"
                        disabled={deletingGuildId === g.id}
                        onClick={() => handleDeleteGuild(g.id, g.name)}
                        className={cn(
                          'px-2 py-1 rounded text-sm font-medium',
                          'bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-50'
                        )}
                      >
                        {deletingGuildId === g.id ? t('loading') : t('deleteGuild')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Whitelist / Blacklist */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">{t('whitelistBlacklistSection')}</h2>
        <p className="text-sm text-muted-foreground">{t('whitelistBlacklistDescription')}</p>
        <div className="flex flex-wrap gap-4 items-center">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={configUseWhitelist}
              onChange={(e) => {
                setConfigUseWhitelist(e.target.checked);
                if (e.target.checked) setConfigUseBlacklist(false);
              }}
              className="rounded border-border"
            />
            <span className="text-sm">{t('useWhitelist')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={configUseBlacklist}
              onChange={(e) => {
                setConfigUseBlacklist(e.target.checked);
                if (e.target.checked) setConfigUseWhitelist(false);
              }}
              className="rounded border-border"
            />
            <span className="text-sm">{t('useBlacklist')}</span>
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1">{t('serverWhitelist')}</label>
            <textarea
              value={configWhitelistText}
              onChange={(e) => setConfigWhitelistText(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('serverBlacklist')}</label>
            <textarea
              value={configBlacklistText}
              onChange={(e) => setConfigBlacklistText(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleSaveConfig}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          {t('saveConfig')}
        </button>
      </section>

      {/* Discord Bot Einladungen */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">{t('discordBotInviteSection')}</h2>
        <p className="text-sm text-muted-foreground">{t('discordBotInviteDescription')}</p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={configDiscordBotInviteEnabled}
            onChange={(e) => setConfigDiscordBotInviteEnabled(e.target.checked)}
            className="rounded border-border"
          />
          <span className="text-sm">{t('discordBotInviteEnabled')}</span>
        </label>
        <button
          type="button"
          onClick={handleSaveFeatures}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          {t('saveConfig')}
        </button>
      </section>

      {/* Wartungsmodus */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">{t('maintenanceSection')}</h2>
        <p className="text-sm text-muted-foreground">{t('maintenanceDescription')}</p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={configMaintenanceMode}
            onChange={(e) => setConfigMaintenanceMode(e.target.checked)}
            className="rounded border-border"
          />
          <span className="text-sm">{t('maintenanceModeActive')}</span>
        </label>
        <div>
          <label className="block text-sm font-medium mb-1">{t('statusMessageLabel')}</label>
          <textarea
            value={configStatusMessage}
            onChange={(e) => setConfigStatusMessage(e.target.value)}
            rows={3}
            placeholder={t('statusMessagePlaceholder')}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={handleSaveFeatures}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          {t('saveConfig')}
        </button>
      </section>

      {/* Admins verwalten */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">{t('adminsSection')}</h2>
        <p className="text-sm text-muted-foreground">{t('adminsSectionDescription')}</p>
        {ownerDiscordId && (
          <div className="rounded-md border border-border p-3 bg-muted/30">
            <p className="text-sm font-medium">{t('owner')}</p>
            <p className="text-sm text-muted-foreground">{t('ownerDescription')}</p>
            <p className="font-mono text-sm mt-1">{ownerDiscordId}</p>
          </div>
        )}
        <p className="text-sm font-medium mt-2">{t('adminsList')}</p>
        <ul className="list-disc list-inside space-y-1 text-sm">
          {admins.map((a) => (
            <li key={a.discordUserId} className="flex items-center gap-2 flex-wrap">
              <span className="font-mono">{a.discordUserId}</span>
              {a.discordUserId !== ownerDiscordId && (
                <button
                  type="button"
                  disabled={removingAdminId === a.discordUserId}
                  onClick={() => handleRemoveAdmin(a.discordUserId)}
                  className="text-destructive hover:underline text-xs disabled:opacity-50"
                >
                  {removingAdminId === a.discordUserId ? t('loading') : t('removeAdmin')}
                </button>
              )}
            </li>
          ))}
          {admins.length === 0 && !ownerDiscordId && (
            <li className="text-muted-foreground">—</li>
          )}
        </ul>
        <div className="flex gap-2 items-center flex-wrap mt-2">
          <input
            type="text"
            value={newAdminId}
            onChange={(e) => setNewAdminId(e.target.value)}
            placeholder={t('addAdminPlaceholder')}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm font-mono w-48"
          />
          <button
            type="button"
            onClick={handleAddAdmin}
            disabled={!newAdminId.trim()}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {t('addAdmin')}
          </button>
        </div>
      </section>
    </div>
  );
}
