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
  battlenetProfileRealmSlug: string | null;
  battlenetProfileRealmId: string | null;
  battlenetGuildId: string | null;
  battlenetGuildName: string | null;
};

type SearchHit = { id: string; name: string; realmSlug: string; realmNumericId?: string | null };

/** Cog (settings) icon for edit link */
function CogIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

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

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');

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

  const [guildNameInput, setGuildNameInput] = useState('');
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [selectedHit, setSelectedHit] = useState<SearchHit | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  const loadLink = useCallback(async () => {
    const res = await fetch(`/api/guilds/${guildId}/battlenet-link`, { credentials: 'include' });
    const text = await res.text();
    let data: LinkState & { error?: string } = {
      discordGuildName: '',
      battlenetRealmId: null,
      battlenetProfileRealmSlug: null,
      battlenetProfileRealmId: null,
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
      battlenetProfileRealmSlug: data.battlenetProfileRealmSlug ?? null,
      battlenetProfileRealmId: data.battlenetProfileRealmId ?? null,
      battlenetGuildId: data.battlenetGuildId,
      battlenetGuildName: data.battlenetGuildName,
    });
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

  const resetModalForm = useCallback(() => {
    setGuildNameInput('');
    setSearchResults([]);
    setSelectedHit(null);
    setRealmMenuOpen(false);
    setErr(null);
  }, []);

  const openCreateModal = () => {
    resetModalForm();
    setModalMode('create');
    setSelectedRealmId('');
    setRealmComboInput('');
    setModalOpen(true);
  };

  const openEditModal = () => {
    if (!link) return;
    resetModalForm();
    setModalMode('edit');
    const rid = link.battlenetRealmId ?? '';
    setSelectedRealmId(rid);
    setGuildNameInput(link.battlenetGuildName?.trim() ?? '');
    setModalOpen(true);
  };

  useEffect(() => {
    if (!modalOpen || !selectedRealmId) return;
    const r = realmOptions.find((x) => x.id === selectedRealmId);
    if (r) setRealmComboInput(formatRealmLabel(r));
  }, [modalOpen, selectedRealmId, realmOptions]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    resetModalForm();
  }, [resetModalForm]);

  const runBnetConnect = async () => {
    if (!selectedRealmId) {
      setErr(t('battlenetSelectRealmFirst'));
      return;
    }
    const q = guildNameInput.trim();
    if (!q) {
      setErr(t('battlenetSearchQueryRequired'));
      return;
    }
    setErr(null);
    setConnectBusy(true);
    setSelectedHit(null);
    setSearchResults([]);
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
      if (results.length === 0) {
        setErr(t('battlenetSearchNoResults'));
      } else if (results.length === 1) {
        setSelectedHit(results[0]!);
      } else {
        setSelectedHit(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setConnectBusy(false);
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
          profileRealmSlug: selectedHit.realmSlug || undefined,
          profileRealmId: selectedHit.realmNumericId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      await loadLink();
      onSaved();
      closeModal();
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
        body: JSON.stringify({
          battlenetRealmId: null,
          battlenetGuildId: null,
          battlenetGuildName: null,
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

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen, closeModal]);

  if (loading) {
    return (
      <section aria-labelledby="battlenet-heading">
        <h3 id="battlenet-heading" className="text-base font-semibold text-foreground mb-1">
          {t('battlenetSection')}
        </h3>
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      </section>
    );
  }

  const isLinked = !!link?.battlenetGuildId;

  return (
    <section aria-labelledby="battlenet-heading" className="space-y-4">
      <h3 id="battlenet-heading" className="text-base font-semibold text-foreground mb-1">
        {t('battlenetSection')}
      </h3>
      <p className="text-sm text-muted-foreground mb-2">{t('battlenetSectionDescription')}</p>

      {link && (
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-0 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">{t('battlenetDiscordName')}:</span>{' '}
              <span className="font-medium">{link.discordGuildName}</span>
            </p>
            {link.battlenetGuildId && (
              <>
                {(link.battlenetProfileRealmSlug || link.battlenetProfileRealmId) && (
                  <p>
                    <span className="text-muted-foreground">{t('battlenetLinkedRealm')}:</span>{' '}
                    <span className="font-medium">
                      {link.battlenetProfileRealmSlug ?? '—'}
                      {link.battlenetProfileRealmId
                        ? ` (${t('battlenetRealmIdLabel')}: ${link.battlenetProfileRealmId})`
                        : ''}
                    </span>
                  </p>
                )}
                <p>
                  <span className="text-muted-foreground">{t('battlenetLinked')}:</span>{' '}
                  {link.battlenetGuildName ?? '—'} — ID {link.battlenetGuildId}
                </p>
              </>
            )}
            {!link.battlenetGuildId && (
              <p className="text-muted-foreground">{t('battlenetNotLinked')}</p>
            )}
          </div>
          <div className="flex shrink-0 items-start gap-2">
            {!isLinked ? (
              <button
                type="button"
                onClick={openCreateModal}
                disabled={saveBusy}
                className="rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {t('battlenetCreateLink')}
              </button>
            ) : (
              <button
                type="button"
                onClick={openEditModal}
                disabled={saveBusy}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted/60 disabled:opacity-50"
                title={t('battlenetEditLink')}
                aria-label={t('battlenetEditLink')}
              >
                <CogIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {err && !modalOpen && (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      )}

      {isLinked && (
        <button
          type="button"
          onClick={clearLink}
          disabled={saveBusy}
          className="rounded-md border border-destructive text-destructive px-4 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {t('battlenetClear')}
        </button>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bnet-modal-title"
            className="w-full max-w-lg rounded-lg border border-border bg-background shadow-lg max-h-[min(90vh,640px)] flex flex-col"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border px-4 py-3 flex items-center justify-between gap-2">
              <h2 id="bnet-modal-title" className="text-base font-semibold">
                {modalMode === 'create' ? t('battlenetModalCreateTitle') : t('battlenetModalEditTitle')}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t('cancel')}
              >
                ×
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">
              {realmsError && (
                <p className="text-sm text-destructive" role="alert">
                  {realmsError}
                </p>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="modal-realm-combo">
                  {t('battlenetRealm')}
                </label>
                <div className="relative" ref={realmPickerRef}>
                  <input
                    id="modal-realm-combo"
                    ref={realmInputRef}
                    type="text"
                    role="combobox"
                    aria-expanded={realmMenuOpen}
                    aria-controls="modal-realm-listbox"
                    autoComplete="off"
                    value={realmComboInput}
                    onChange={(e) => {
                      setRealmComboInput(e.target.value);
                      setRealmMenuOpen(true);
                      setSelectedRealmId('');
                      setSelectedHit(null);
                      setSearchResults([]);
                    }}
                    onFocus={() => setRealmMenuOpen(true)}
                    placeholder={t('battlenetRealmPlaceholder')}
                    disabled={realmsLoading || saveBusy || connectBusy}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm w-full"
                  />
                  {realmMenuOpen && realmListBox && !realmsLoading && (
                    <ul
                      id="modal-realm-listbox"
                      role="listbox"
                      className="fixed z-[110] overflow-y-auto rounded-md border border-border bg-background py-1 shadow-lg"
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
                              setSelectedHit(null);
                              setSearchResults([]);
                            }}
                          >
                            {formatRealmLabel(r)}{' '}
                            <span className="text-muted-foreground">({r.region})</span>
                          </button>
                        </li>
                      ))}
                      {filteredRealmSuggestions.length === 0 && (
                        <li className="px-3 py-2 text-sm text-muted-foreground">
                          {t('battlenetNoRealmMatches')}
                        </li>
                      )}
                    </ul>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{t('battlenetRealmHint')}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="modal-guild-name">
                  {t('battlenetGuildNameLabel')}
                </label>
                <input
                  id="modal-guild-name"
                  type="text"
                  value={guildNameInput}
                  onChange={(e) => {
                    setGuildNameInput(e.target.value);
                    setSelectedHit(null);
                    setSearchResults([]);
                  }}
                  placeholder={t('battlenetManualPlaceholder')}
                  disabled={connectBusy || saveBusy}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm w-full"
                />
                <p className="text-xs text-muted-foreground">{t('battlenetConnectHint')}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={runBnetConnect}
                  disabled={connectBusy || saveBusy || !selectedRealmId}
                  className="rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                >
                  {connectBusy ? t('loading') : t('battlenetConnect')}
                </button>
              </div>

              {modalOpen && err && (
                <p className="text-sm text-destructive" role="alert">
                  {err}
                </p>
              )}

              {(searchResults.length > 0 || selectedHit) && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('battlenetResults')}</p>
                  <ul className="space-y-1">
                    {searchResults.map((h) => (
                      <li key={h.id}>
                        <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-muted/40">
                          <input
                            type="radio"
                            name="bnet-guild-hit-modal"
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
                      <li className="rounded-md border border-border px-3 py-2 text-sm bg-muted/20">
                        <span className="font-medium">{selectedHit.name}</span>{' '}
                        <span className="text-muted-foreground">(ID {selectedHit.id})</span>
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            <div className="border-t border-border px-4 py-3 flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={closeModal}
                disabled={saveBusy}
                className="rounded-md border border-input px-4 py-2.5 text-sm font-medium"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={saveLink}
                disabled={saveBusy || !selectedHit || !selectedRealmId}
                className="rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-50"
              >
                {saveBusy ? t('saving') : t('battlenetSave')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
