'use client';

import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { WowRealm } from '@/lib/wow-classic-realms';

function formatRealmLabel(realm: WowRealm): string {
  const n = (realm.name || realm.slug || '').trim();
  const v = (realm.wowVersion || '').trim();
  return v ? `${n} (${v})` : n;
}

type LinkState = {
  discordGuildName: string;
  battlenetRealmId: string | null;
  battlenetGuildId: string | null;
  battlenetGuildName: string | null;
};

type SearchHit = { id: string; name: string; realmSlug: string };

export function GuildBattlenetSection({
  guildId,
  onSaved,
}: {
  guildId: string;
  onSaved: () => void;
}) {
  const t = useTranslations('guildManagement');
  const locale = useLocale();
  const [link, setLink] = useState<LinkState | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [realmOptions, setRealmOptions] = useState<WowRealm[]>([]);
  const [realmsLoading, setRealmsLoading] = useState(false);
  const [realmsError, setRealmsError] = useState<string | null>(null);

  const [realmComboInput, setRealmComboInput] = useState('');
  const [realmMenuOpen, setRealmMenuOpen] = useState(false);
  const [selectedRealmId, setSelectedRealmId] = useState('');
  const realmPickerRef = useRef<HTMLDivElement>(null);
  const realmInputRef = useRef<HTMLInputElement>(null);
  const [realmListBox, setRealmListBox] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const [manualQuery, setManualQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [selectedHit, setSelectedHit] = useState<SearchHit | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  const loadLink = useCallback(async () => {
    const res = await fetch(`/api/guilds/${guildId}/battlenet-link`, { credentials: 'include' });
    const text = await res.text();
    let data: LinkState & { error?: string } = {
      discordGuildName: '',
      battlenetRealmId: null,
      battlenetGuildId: null,
      battlenetGuildName: null,
    };
    try {
      data = text ? (JSON.parse(text) as typeof data) : data;
    } catch {
      throw new Error(text || res.statusText);
    }
    if (!res.ok) throw new Error(data.error || res.statusText);
    setLink({
      discordGuildName: data.discordGuildName,
      battlenetRealmId: data.battlenetRealmId,
      battlenetGuildId: data.battlenetGuildId,
      battlenetGuildName: data.battlenetGuildName,
    });
    if (data.battlenetRealmId) {
      setSelectedRealmId(data.battlenetRealmId);
    }
  }, [guildId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        await loadLink();
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadLink]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRealmsLoading(true);
      setRealmsError(null);
      try {
        const res = await fetch(`/api/wow/realms?locale=${encodeURIComponent(locale)}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        const text = await res.text();
        let data: { realms?: WowRealm[]; error?: string } = {};
        try {
          data = text ? (JSON.parse(text) as typeof data) : {};
        } catch {
          if (!cancelled) {
            setRealmOptions([]);
            setRealmsError(t('battlenetRealmsLoadFailed'));
          }
          return;
        }
        if (!res.ok) {
          if (!cancelled) {
            setRealmOptions([]);
            setRealmsError(data.error || t('battlenetRealmsLoadFailed'));
          }
          return;
        }
        if (!cancelled) setRealmOptions(Array.isArray(data.realms) ? data.realms : []);
      } catch {
        if (!cancelled) {
          setRealmOptions([]);
          setRealmsError(t('battlenetRealmsLoadFailed'));
        }
      } finally {
        if (!cancelled) setRealmsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locale, t]);

  const selectedRealm = useMemo(
    () => (selectedRealmId ? realmOptions.find((r) => r.id === selectedRealmId) ?? null : null),
    [realmOptions, selectedRealmId]
  );

  const filteredRealmSuggestions = useMemo(() => {
    const q = realmComboInput.trim().toLowerCase();
    if (!q) return realmOptions;
    return realmOptions.filter((realm) => {
      const label = formatRealmLabel(realm).toLowerCase();
      return (
        label.includes(q) ||
        realm.slug.toLowerCase().includes(q) ||
        realm.region.toLowerCase().includes(q)
      );
    });
  }, [realmOptions, realmComboInput]);

  useLayoutEffect(() => {
    if (!realmMenuOpen) {
      setRealmListBox(null);
      return;
    }
    const el = realmInputRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const margin = 8;
      const maxHeight = Math.min(280, Math.max(margin, window.innerHeight - r.bottom - margin));
      setRealmListBox({
        top: r.bottom + margin / 2,
        left: r.left,
        width: r.width,
        maxHeight,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [realmMenuOpen, realmComboInput, filteredRealmSuggestions.length, realmsLoading]);

  useEffect(() => {
    if (!realmMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (realmPickerRef.current?.contains(e.target as Node)) return;
      setRealmMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [realmMenuOpen]);

  useEffect(() => {
    if (selectedRealm) {
      setRealmComboInput(formatRealmLabel(selectedRealm));
    }
  }, [selectedRealm]);

  const runAuto = async () => {
    if (!selectedRealmId) {
      setErr(t('battlenetSelectRealmFirst'));
      return;
    }
    setErr(null);
    setAutoBusy(true);
    setSearchResults([]);
    setSelectedHit(null);
    try {
      const res = await fetch(`/api/guilds/${guildId}/battlenet-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'auto', realmId: selectedRealmId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.status === 'ok' && data.guild) {
        setSelectedHit(data.guild);
        setSearchResults([]);
      } else if (data.status === 'ambiguous' && Array.isArray(data.guilds)) {
        setSearchResults(data.guilds);
        setSelectedHit(null);
      } else {
        setErr(t('battlenetAutoNotFound'));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAutoBusy(false);
    }
  };

  const runSearch = async () => {
    if (!selectedRealmId) {
      setErr(t('battlenetSelectRealmFirst'));
      return;
    }
    const q = manualQuery.trim();
    if (!q) {
      setErr(t('battlenetSearchQueryRequired'));
      return;
    }
    setErr(null);
    setSearchBusy(true);
    setSelectedHit(null);
    try {
      const res = await fetch(`/api/guilds/${guildId}/battlenet-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'search', realmId: selectedRealmId, query: q }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      const results = Array.isArray(data.results) ? data.results : [];
      setSearchResults(results);
      if (results.length === 0) setErr(t('battlenetSearchNoResults'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSearchBusy(false);
    }
  };

  const saveLink = async () => {
    if (!selectedRealmId || !selectedHit) {
      setErr(t('battlenetSelectResultFirst'));
      return;
    }
    setErr(null);
    setSaveBusy(true);
    try {
      const res = await fetch(`/api/guilds/${guildId}/battlenet-link`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          battlenetRealmId: selectedRealmId,
          battlenetGuildId: selectedHit.id,
          battlenetGuildName: selectedHit.name,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      await loadLink();
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaveBusy(false);
    }
  };

  const clearLink = async () => {
    if (!confirm(t('battlenetClearConfirm'))) return;
    setErr(null);
    setSaveBusy(true);
    try {
      const res = await fetch(`/api/guilds/${guildId}/battlenet-link`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          battlenetRealmId: null,
          battlenetGuildId: null,
          battlenetGuildName: null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      setSelectedHit(null);
      setSearchResults([]);
      setManualQuery('');
      await loadLink();
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaveBusy(false);
    }
  };

  if (loading) {
    return (
      <section aria-labelledby="battlenet-heading">
        <h2 id="battlenet-heading" className="text-lg font-semibold text-foreground mb-1">
          {t('battlenetSection')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="battlenet-heading" className="space-y-4">
      <h2 id="battlenet-heading" className="text-lg font-semibold text-foreground mb-1">
        {t('battlenetSection')}
      </h2>
      <p className="text-sm text-muted-foreground mb-2">{t('battlenetSectionDescription')}</p>

      {link && (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm space-y-1">
          <p>
            <span className="text-muted-foreground">{t('battlenetDiscordName')}:</span>{' '}
            <span className="font-medium">{link.discordGuildName}</span>
          </p>
          {link.battlenetGuildId && (
            <p>
              <span className="text-muted-foreground">{t('battlenetLinked')}:</span>{' '}
              {link.battlenetGuildName ?? '—'} — ID {link.battlenetGuildId}
            </p>
          )}
          {!link.battlenetGuildId && (
            <p className="text-muted-foreground">{t('battlenetNotLinked')}</p>
          )}
        </div>
      )}

      {err && (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      )}
      {realmsError && (
        <p className="text-sm text-destructive" role="alert">
          {realmsError}
        </p>
      )}

      <div className="space-y-2 max-w-xl">
        <label className="text-sm font-medium" htmlFor="realm-combo">
          {t('battlenetRealm')}
        </label>
        <div className="relative" ref={realmPickerRef}>
          <input
            id="realm-combo"
            ref={realmInputRef}
            type="text"
            role="combobox"
            aria-expanded={realmMenuOpen}
            aria-controls="realm-listbox"
            autoComplete="off"
            value={realmComboInput}
            onChange={(e) => {
              setRealmComboInput(e.target.value);
              setRealmMenuOpen(true);
              setSelectedRealmId('');
            }}
            onFocus={() => setRealmMenuOpen(true)}
            placeholder={t('battlenetRealmPlaceholder')}
            disabled={realmsLoading || saveBusy}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm w-full"
          />
          {realmMenuOpen && realmListBox && !realmsLoading && (
            <ul
              id="realm-listbox"
              role="listbox"
              className="fixed z-50 overflow-y-auto rounded-md border border-border bg-background py-1 shadow-lg"
              style={{
                top: realmListBox.top,
                left: realmListBox.left,
                width: realmListBox.width,
                maxHeight: realmListBox.maxHeight,
              }}
            >
              {filteredRealmSuggestions.slice(0, 200).map((r) => (
                <li key={r.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60"
                    onClick={() => {
                      setSelectedRealmId(r.id);
                      setRealmComboInput(formatRealmLabel(r));
                      setRealmMenuOpen(false);
                    }}
                  >
                    {formatRealmLabel(r)} <span className="text-muted-foreground">({r.region})</span>
                  </button>
                </li>
              ))}
              {filteredRealmSuggestions.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted-foreground">{t('battlenetNoRealmMatches')}</li>
              )}
            </ul>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t('battlenetRealmHint')}</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={runAuto}
          disabled={autoBusy || saveBusy || !selectedRealmId}
          className="rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {autoBusy ? t('loading') : t('battlenetAutoSearch')}
        </button>
        <span className="text-sm text-muted-foreground">{t('battlenetAutoSearchHint')}</span>
      </div>

      <div className="space-y-2 max-w-xl">
        <label className="text-sm font-medium" htmlFor="manual-search">
          {t('battlenetManualSearch')}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="manual-search"
            type="text"
            value={manualQuery}
            onChange={(e) => setManualQuery(e.target.value)}
            placeholder={t('battlenetManualPlaceholder')}
            disabled={searchBusy || saveBusy}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm flex-1 min-w-[12rem]"
          />
          <button
            type="button"
            onClick={runSearch}
            disabled={searchBusy || saveBusy || !selectedRealmId}
            className="rounded-md border border-input px-4 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {searchBusy ? t('loading') : t('battlenetSearchButton')}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{t('battlenetManualHint')}</p>
      </div>

      {(searchResults.length > 0 || selectedHit) && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('battlenetResults')}</p>
          <ul className="space-y-1 max-w-xl">
            {searchResults.map((h) => (
              <li key={h.id}>
                <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-muted/40">
                  <input
                    type="radio"
                    name="bnet-guild-hit"
                    checked={selectedHit?.id === h.id}
                    onChange={() => setSelectedHit(h)}
                  />
                  <span className="text-sm">
                    <span className="font-medium">{h.name}</span>{' '}
                    <span className="text-muted-foreground">(ID {h.id})</span>
                  </span>
                </label>
              </li>
            ))}
            {selectedHit && searchResults.length === 0 && (
              <li className="rounded-md border border-border px-3 py-2 text-sm">
                <span className="font-medium">{selectedHit.name}</span>{' '}
                <span className="text-muted-foreground">(ID {selectedHit.id})</span>
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={saveLink}
          disabled={saveBusy || !selectedHit || !selectedRealmId}
          className="rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {saveBusy ? t('saving') : t('battlenetSave')}
        </button>
        <button
          type="button"
          onClick={clearLink}
          disabled={saveBusy || !link?.battlenetGuildId}
          className="rounded-md border border-destructive text-destructive px-4 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {t('battlenetClear')}
        </button>
      </div>
    </section>
  );
}
