'use client';

import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { SpecIcon } from '@/components/spec-icon';
import { ClassIcon } from '@/components/class-icon';
import {
  TBC_CLASSES,
  getSpecDisplayName,
  getAllSpecDisplayNames,
  getSpecByDisplayName,
} from '@/lib/wow-tbc-classes';
import type { BattlenetProfileJson } from '@/lib/battlenet-character-persist';
import {
  type WowRealm,
} from '@/lib/wow-classic-realms';
import { CharacterDiscordNameHint } from '@/components/character-discord-name-hint';

type CharacterRow = {
  id: string;
  name: string;
  guildId: string | null;
  guildName: string | null;
  /** Gespeicherter Anzeigename auf dem Discord der Gilde (Sync beim Login) */
  guildDiscordDisplayName?: string | null;
  mainSpec: string;
  offSpec: string | null;
  isMain: boolean;
  classId?: string | null;
  hasBattlenet?: boolean;
  battlenetRealmSlug?: string | null;
};

type GuildOption = { id: string; name: string; battlenetRealmId?: string | null };

const allSpecs = getAllSpecDisplayNames();

function getClassIdForSpec(displayName: string): string | null {
  const s = allSpecs.find((x) => x.displayName === displayName);
  return s?.classId ?? null;
}

function formatRealmLabel(realm: WowRealm): string {
  const n = (realm.name || realm.slug || '').trim();
  const v = (realm.wowVersion || '').trim();
  return v ? `${n} ${v}`.trim() : n;
}

function realmNameAndVersion(realm: WowRealm): { name: string; version: string } {
  const name = (realm.name || realm.slug || '').trim();
  const version = (realm.wowVersion || '').trim();
  return { name, version };
}

export function ProfileCharacters({
  initialData,
  guilds,
}: {
  initialData: CharacterRow[];
  guilds: GuildOption[];
}) {
  const t = useTranslations('profile');
  const locale = useLocale();
  const router = useRouter();
  const singleGuild = guilds.length === 1 ? guilds[0] : null;
  const [list, setList] = useState(initialData);
  const [modalOpen, setModalOpen] = useState<'add' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const openAddButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!openMenuId) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuId(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openMenuId]);
  const [name, setName] = useState('');
  const [guildId, setGuildId] = useState('');
  const [saveWithoutGuild, setSaveWithoutGuild] = useState(false);
  const [classId, setClassId] = useState('');
  const [mainSpecId, setMainSpecId] = useState('');
  const [offSpecId, setOffSpecId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRealmId, setAutoRealmId] = useState('');
  /** Single combobox: search text + shows selected realm label after pick */
  const [realmComboInput, setRealmComboInput] = useState('');
  const [realmMenuOpen, setRealmMenuOpen] = useState(false);
  const [realmsLoadError, setRealmsLoadError] = useState<string | null>(null);
  const realmPickerRef = useRef<HTMLDivElement>(null);
  const realmInputRef = useRef<HTMLInputElement>(null);
  const [realmListBox, setRealmListBox] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(
    null
  );
  const [realmOptions, setRealmOptions] = useState<WowRealm[]>([]);
  const [realmsLoading, setRealmsLoading] = useState(false);
  const [pendingBattlenetProfile, setPendingBattlenetProfile] = useState<BattlenetProfileJson | null>(null);
  const [bnetSyncHint, setBnetSyncHint] = useState<string | null>(null);
  const [bnetSyncLoading, setBnetSyncLoading] = useState(false);

  const mainSpecOptions = useMemo(() => {
    if (!classId) return [];
    return TBC_CLASSES.find((c) => c.id === classId)?.specs ?? [];
  }, [classId]);

  const resetForm = useCallback(() => {
    setName('');
    setGuildId('');
    setSaveWithoutGuild(false);
    setClassId('');
    setMainSpecId('');
    setOffSpecId('');
    setError(null);
    setAutoRealmId('');
    setRealmComboInput('');
    setRealmMenuOpen(false);
    setRealmsLoadError(null);
    setPendingBattlenetProfile(null);
    setBnetSyncHint(null);
    setBnetSyncLoading(false);
  }, []);

  const openAdd = useCallback(() => {
    setEditingId(null);
    resetForm();
    if (guilds.length >= 1) {
      setGuildId(guilds[0].id);
    }
    setModalOpen('add');
  }, [resetForm, guilds]);

  const openEdit = useCallback((c: CharacterRow) => {
    setEditingId(c.id);
    setName(c.name);
    setGuildId(c.guildId || '');
    setSaveWithoutGuild(!c.guildId);
    const parsed = allSpecs.find((s) => s.displayName === c.mainSpec);
    if (parsed) {
      setClassId(parsed.classId);
      setMainSpecId(parsed.specId);
    } else {
      setClassId('');
      setMainSpecId('');
    }
    const offParsed = c.offSpec ? allSpecs.find((s) => s.displayName === c.offSpec) : null;
    if (offParsed && offParsed.classId === (parsed?.classId ?? '')) {
      setOffSpecId(offParsed.specId);
    } else {
      setOffSpecId('');
    }
    setPendingBattlenetProfile(null);
    setBnetSyncHint(null);
    setBnetSyncLoading(false);
    setAutoRealmId('');
    setRealmComboInput('');
    setRealmMenuOpen(false);
    setRealmsLoadError(null);
    setError(null);
    setModalOpen('edit');
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(null);
    setEditingId(null);
    resetForm();
  }, [resetForm]);

  useEffect(() => {
    if (modalOpen !== 'add' && modalOpen !== 'edit') return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleEsc);
    const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
      'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleEsc);
      openAddButtonRef.current?.focus({ preventScroll: true });
    };
  }, [modalOpen, closeModal]);

  const parseError = async (res: Response): Promise<string> => {
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      return (data?.error ?? text) || t('errorSave');
    } catch {
      return text || t('errorSave');
    }
  };

  const handleBnetSync = async () => {
    setBnetSyncHint(null);
    setError(null);
    if (!autoRealmId || !name.trim()) return;
    setBnetSyncLoading(true);
    try {
      const res = await fetch('/api/user/characters/battlenet-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          realmId: autoRealmId,
          name: name.trim(),
          appLocale: locale,
        }),
      });
      const text = await res.text();
      let data: {
        characterName?: string;
        mainSpec?: string;
        profile?: BattlenetProfileJson;
        error?: string;
        notFound?: boolean;
        battlenetDebug?: { requestUrl: string; httpStatus: number; method: string };
      } = {};
      try {
        data = text ? (JSON.parse(text) as typeof data) : {};
      } catch {
        /* ignore */
      }
      if (res.ok && data.profile && data.characterName != null && data.mainSpec) {
        setPendingBattlenetProfile(data.profile);
        setName(data.characterName);
        const specParsed = getSpecByDisplayName(data.mainSpec);
        if (specParsed) {
          setClassId(specParsed.classId);
          setMainSpecId(specParsed.specId);
          setOffSpecId('');
        }
        return;
      }
      if (data.battlenetDebug?.requestUrl) {
        console.error('[RaidFlow][Battle.net] Character fetch failed', {
          method: data.battlenetDebug.method,
          url: data.battlenetDebug.requestUrl,
          httpStatus: data.battlenetDebug.httpStatus,
          message: data.error,
        });
      }
      setError((data.error ?? text) || t('errorSave'));
      if (data.notFound) setBnetSyncHint(t('bnetExactSpellingHint'));
    } catch (err) {
      setError(t('errorSave'));
      console.error(err);
    } finally {
      setBnetSyncLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !classId || !mainSpecId) return;
    const mainSpec = getSpecDisplayName(classId, mainSpecId);
    setLoading(true);
    try {
      const res = await fetch('/api/user/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          guildId: guildId || null,
          mainSpec,
          offSpec: offSpecId ? getSpecDisplayName(classId, offSpecId) : null,
          ...(pendingBattlenetProfile ? { battlenetProfile: pendingBattlenetProfile } : {}),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.character) {
          router.refresh();
          setList((prev) => [...prev, data.character]);
          resetForm();
          setModalOpen(null);
        } else {
          setError(t('errorSave'));
        }
      } else {
        setError(await parseError(res));
      }
    } catch (err) {
      setError(t('errorSave'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSetMain = async (id: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/user/characters/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isMain: true }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        router.refresh();
        const target = list.find((x) => x.id === id);
        const sameGuildId = target?.guildId ?? null;
        setList((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, isMain: true } : sameGuildId && r.guildId === sameGuildId ? { ...r, isMain: false } : r
          )
        );
      } else {
        setError(await parseError(res));
      }
    } catch (err) {
      setError(t('errorSave'));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!editingId || !name.trim() || !classId || !mainSpecId) return;
    const mainSpec = getSpecDisplayName(classId, mainSpecId);
    setLoading(true);
    try {
      const res = await fetch(`/api/user/characters/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          guildId: guildId || null,
          mainSpec,
          offSpec: offSpecId ? getSpecDisplayName(classId, offSpecId) : null,
          ...(pendingBattlenetProfile ? { battlenetProfile: pendingBattlenetProfile } : {}),
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        router.refresh();
        setList((prev) => prev.map((r) => (r.id === editingId ? (data.character ?? r) : r)));
        closeModal();
      } else {
        setError(await parseError(res));
      }
    } catch (err) {
      setError(t('errorSave'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/user/characters/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        router.refresh();
        setList((prev) => prev.filter((r) => r.id !== id));
        if (editingId === id) closeModal();
      } else {
        setError(await parseError(res));
      }
    } finally {
      setLoading(false);
    }
  };

  const charsInSameGuild = (guildId: string | null) =>
    guildId ? list.filter((c) => c.guildId === guildId) : [];
  const canSetMain = (c: CharacterRow) => !!c.guildId && !c.isMain;

  const groupedCharacters = useMemo(() => {
    const map = new Map<
      string,
      { guildId: string | null; guildName: string; characters: CharacterRow[] }
    >();

    for (const c of list) {
      const key = c.guildId ?? '__no_guild__';
      const guildName = c.guildName ?? t('withoutGuild');
      const existing = map.get(key);
      if (existing) existing.characters.push(c);
      else map.set(key, { guildId: c.guildId, guildName, characters: [c] });
    }

    const groups = Array.from(map.values()).sort((a, b) => {
      const aNo = a.guildId == null;
      const bNo = b.guildId == null;
      if (aNo !== bNo) return aNo ? 1 : -1; // "Ohne Gilde" zuletzt
      return a.guildName.localeCompare(b.guildName);
    });

    for (const g of groups) {
      g.characters.sort((a, b) => {
        if (a.isMain !== b.isMain) return a.isMain ? -1 : 1; // Main zuerst
        return a.name.localeCompare(b.name);
      });
    }

    return groups;
  }, [list, t]);

  const selectedMainSpecDisplay = classId && mainSpecId ? getSpecDisplayName(classId, mainSpecId) : null;
  const selectedOffSpecDisplay = classId && offSpecId ? getSpecDisplayName(classId, offSpecId) : null;

  const selectedRealm = useMemo(
    () => (autoRealmId ? realmOptions.find((r) => r.id === autoRealmId) ?? null : null),
    [realmOptions, autoRealmId]
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

  const realmHintCount = realmComboInput.trim() ? filteredRealmSuggestions.length : realmOptions.length;

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
    setPendingBattlenetProfile(null);
  }, [autoRealmId]);

  useEffect(() => {
    if (modalOpen !== 'add' && modalOpen !== 'edit') return;
    if (realmOptions.length === 0) return;
    if (!guildId || saveWithoutGuild) return;
    const g = guilds.find((x) => x.id === guildId);
    const rid = g?.battlenetRealmId;
    if (!rid) return;
    const realm = realmOptions.find((r) => r.id === rid);
    if (realm) {
      setAutoRealmId(realm.id);
      setRealmComboInput(formatRealmLabel(realm));
    }
  }, [guildId, saveWithoutGuild, guilds, realmOptions, modalOpen]);

  useEffect(() => {
    if (modalOpen !== 'edit' || !editingId) return;
    if (realmOptions.length === 0) return;
    if (guildId && !saveWithoutGuild) return;
    const c = list.find((x) => x.id === editingId);
    const slug = c?.battlenetRealmSlug;
    if (!slug) return;
    const realm = realmOptions.find((r) => r.slug.toLowerCase() === slug.toLowerCase());
    if (realm) {
      setAutoRealmId(realm.id);
      setRealmComboInput(formatRealmLabel(realm));
    }
  }, [modalOpen, editingId, list, realmOptions, guildId, saveWithoutGuild]);

  useEffect(() => {
    if (modalOpen !== 'add' && modalOpen !== 'edit') return;
    let cancelled = false;

    const loadRealms = async () => {
      setRealmsLoading(true);
      setRealmsLoadError(null);
      try {
        const res = await fetch(`/api/wow/realms?locale=${encodeURIComponent(locale)}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        const text = await res.text();
        let data: { realms?: WowRealm[]; error?: string } = {};
        try {
          data = text ? (JSON.parse(text) as { realms?: WowRealm[]; error?: string }) : {};
        } catch {
          if (!cancelled) {
            setRealmOptions([]);
            setRealmsLoadError(t('realmsLoadFailed'));
          }
          return;
        }
        if (!res.ok) {
          if (!cancelled) {
            setRealmOptions([]);
            if (res.status === 401) {
              setRealmsLoadError(t('realmsLoadUnauthorized'));
            } else {
              setRealmsLoadError(data.error || t('realmsLoadFailed'));
            }
          }
          return;
        }
        if (!cancelled) {
          setRealmOptions(Array.isArray(data.realms) ? data.realms : []);
        }
      } catch {
        if (!cancelled) {
          setRealmOptions([]);
          setRealmsLoadError(t('realmsLoadFailed'));
        }
      } finally {
        if (!cancelled) setRealmsLoading(false);
      }
    };

    loadRealms();
    return () => {
      cancelled = true;
    };
  }, [modalOpen, t, locale]);

  const formContent = (
    <>
      {error && (
        <p className="text-destructive text-sm mb-2" role="alert">
          {error}
        </p>
      )}
      {bnetSyncHint && (
        <p className="text-amber-600 dark:text-amber-500 text-sm mb-2" role="status">
          {bnetSyncHint}
        </p>
      )}
      <p className="text-sm text-muted-foreground mb-3">{t('characterAddBnetHint')}</p>
      {/* Vorschau wie tatsächlicher Charakter-Button (ohne Main/Twink, ohne Burger-Menü) */}
      {(classId || selectedMainSpecDisplay || name.trim()) && (
        <div className="mb-3 grid items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm" style={{ gridTemplateColumns: '28px auto 1fr minmax(4rem, 1fr)' }}>
          <div className="flex shrink-0 items-center justify-center w-7 h-7">
            {classId ? <ClassIcon classId={classId} size={24} title={TBC_CLASSES.find((c) => c.id === classId)?.name} /> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1 min-w-0">
            {selectedMainSpecDisplay && <SpecIcon spec={selectedMainSpecDisplay} size={24} />}
            {selectedOffSpecDisplay && (
              <>
                <span className="text-muted-foreground text-xs font-medium">/</span>
                <span className="grayscale contrast-90 inline-flex">
                  <SpecIcon spec={selectedOffSpecDisplay} size={24} className="opacity-90" />
                </span>
              </>
            )}
          </div>
          <span className="font-medium text-base truncate min-w-0 text-muted-foreground">
            {name.trim() || '…'}
          </span>
          <span className="text-sm text-muted-foreground text-center truncate min-w-0">
            {guildId ? (guilds.find((g) => g.id === guildId)?.name ?? '–') : '–'}
          </span>
        </div>
      )}
      <div className="grid gap-3">
        {guilds.length > 1 ? (
          <>
            <label className="text-sm font-medium">{t('guild')} ({t('optional')})</label>
            <select
              value={guildId}
              onChange={(e) => setGuildId(e.target.value)}
              className="rounded border border-input bg-background px-3 py-2 w-full"
            >
              {guilds.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
              <option value="">{t('withoutGuild')}</option>
            </select>
          </>
        ) : guilds.length === 1 && singleGuild ? (
          <>
            <div className="grid gap-1">
              <p className="text-sm font-medium">{t('guild')} ({t('optional')})</p>
              <p className="text-sm text-muted-foreground">{singleGuild.name}</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={saveWithoutGuild}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSaveWithoutGuild(checked);
                  setGuildId(checked ? '' : singleGuild.id);
                }}
              />
              {t('saveWithoutGuild')}
            </label>
          </>
        ) : null}
        <label className="text-sm font-medium" htmlFor="character-realm-combobox">
          {t('server')} <span className="text-muted-foreground font-normal">({t('optional')})</span>
        </label>
        {realmsLoadError && (
          <p className="text-destructive text-sm" role="alert">
            {realmsLoadError}
          </p>
        )}
        <div className="relative" ref={realmPickerRef}>
          <input
            ref={realmInputRef}
            id="character-realm-combobox"
            type="text"
            value={realmComboInput}
            onChange={(e) => {
              const v = e.target.value;
              setRealmComboInput(v);
              setRealmMenuOpen(true);
              if (selectedRealm && formatRealmLabel(selectedRealm) !== v.trim()) {
                setAutoRealmId('');
              }
            }}
            onFocus={() => setRealmMenuOpen(true)}
            placeholder={t('serverSearchPlaceholder')}
            autoComplete="off"
            aria-expanded={realmMenuOpen}
            aria-controls="realm-suggestion-list"
            aria-autocomplete="list"
            className="rounded border border-input bg-background px-3 py-2 w-full"
          />
          {realmMenuOpen && realmListBox && (
            <ul
              id="realm-suggestion-list"
              role="listbox"
              style={{
                position: 'fixed',
                top: realmListBox.top,
                left: realmListBox.left,
                width: realmListBox.width,
                maxHeight: realmListBox.maxHeight,
                zIndex: 100,
              }}
              className="overflow-auto rounded-md border border-border bg-background py-1 shadow-md"
            >
              {realmsLoading && (
                <li className="px-3 py-2 text-sm text-muted-foreground">{t('loadingRealms')}</li>
              )}
              {!realmsLoading &&
                filteredRealmSuggestions.map((realm) => {
                  const { name: rn, version } = realmNameAndVersion(realm);
                  return (
                    <li key={realm.id} role="option">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setAutoRealmId(realm.id);
                          setRealmComboInput(formatRealmLabel(realm));
                          setRealmMenuOpen(false);
                        }}
                      >
                        <span>{rn}</span>
                        {version && (
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                            {version}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              {!realmsLoading && filteredRealmSuggestions.length === 0 && realmOptions.length > 0 && (
                <li className="px-3 py-2 text-sm text-muted-foreground">{t('realmNoMatches')}</li>
              )}
              {!realmsLoading && realmOptions.length === 0 && !realmsLoadError && (
                <li className="px-3 py-2 text-sm text-muted-foreground">{t('realmListEmpty')}</li>
              )}
            </ul>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {realmsLoading
            ? t('loadingRealms')
            : realmsLoadError
              ? t('realmPickFromList')
              : t('realmFilterHint', { count: realmHintCount })}
        </p>
        {!autoRealmId && realmComboInput.trim().length > 0 && !realmsLoadError && (
          <p className="text-xs text-amber-600 dark:text-amber-500">{t('realmPickFromList')}</p>
        )}
        <label className="text-sm font-medium">
          {t('characterName')} <span className="text-destructive">*</span>
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('characterName')}
            className="rounded border border-input bg-background px-3 py-2 w-full min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={() => void handleBnetSync()}
            disabled={loading || bnetSyncLoading || !autoRealmId || !name.trim()}
            className="rounded border border-input bg-background px-3 py-2 text-sm font-medium whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            {bnetSyncLoading ? t('bnetSyncLoading') : t('bnetSync')}
          </button>
        </div>
        {pendingBattlenetProfile ? (
          <p className="text-xs text-muted-foreground">{t('bnetPendingSaveHint')}</p>
        ) : null}
        <label className="text-sm font-medium">{t('class')} <span className="text-destructive">*</span></label>
        <select
          value={classId}
          onChange={(e) => {
            setClassId(e.target.value);
            setMainSpecId('');
            setOffSpecId('');
          }}
          className="rounded border border-input bg-background px-3 py-2 w-full"
        >
          <option value="">{t('class')} …</option>
          {TBC_CLASSES.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name}
            </option>
          ))}
        </select>
        <label className="text-sm font-medium">{t('mainSpec')} <span className="text-destructive">*</span></label>
        <select
          value={mainSpecId}
          onChange={(e) => setMainSpecId(e.target.value)}
          className="rounded border border-input bg-background px-3 py-2 w-full"
        >
          <option value="">{t('mainSpec')} …</option>
          {mainSpecOptions.map((spec) => (
            <option key={spec.id} value={spec.id}>
              {spec.name} ({spec.role})
            </option>
          ))}
        </select>
        <label className="text-sm font-medium">{t('offSpec')}</label>
        <select
          value={offSpecId}
          onChange={(e) => setOffSpecId(e.target.value)}
          className="rounded border border-input bg-background px-3 py-2 w-full"
        >
          <option value="">–</option>
          {mainSpecOptions.map((spec) => (
            <option key={spec.id} value={spec.id} disabled={spec.id === mainSpecId}>
              {spec.name}
            </option>
          ))}
        </select>
      </div>
    </>
  );

  return (
    <section className="mb-8" aria-labelledby="characters-heading">
      <h2 id="characters-heading" className="text-lg font-semibold text-foreground mb-2">
        {t('characters')}
      </h2>
      <p className="text-muted-foreground text-sm mb-4">{t('charactersDescription')}</p>

      {list.length === 0 && (
        <p className="text-muted-foreground text-sm mb-2">{t('noCharacters')}</p>
      )}
      <div className="mb-4 space-y-2 max-w-[44rem] min-w-0">
        {groupedCharacters.map((group) => (
          <div key={group.guildId ?? '__no_guild__'} className="space-y-2">
            <div className="pt-2">
              <h3 className="text-sm font-semibold text-foreground">{group.guildName}</h3>
            </div>
            {group.characters.map((c) => {
              const cClassId = c.classId ?? getClassIdForSpec(c.mainSpec);
              const twinkLabel = c.guildId && !c.isMain && charsInSameGuild(c.guildId).length > 1;
              const mainOrAltTitle = c.isMain && c.guildId ? t('mainLabel') : twinkLabel ? t('altLabel') : undefined;
              const ICON_SIZE = 24;
              const menuOpen = openMenuId === c.id;
              return (
                <div
                  key={c.id}
                  className="grid items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm grid-cols-[32px_28px_1fr_44px] sm:grid-cols-[32px_28px_auto_1fr_minmax(4rem,1fr)_44px] min-w-0"
                >
                  <div className="flex shrink-0 items-center justify-center w-8 h-8 mr-0.5" title={mainOrAltTitle}>
                    {c.isMain && c.guildId ? (
                      <span className="inline-flex items-center justify-center text-[22px] leading-none text-amber-400" aria-label={t('mainLabel')}>
                        ⭐
                      </span>
                    ) : twinkLabel ? (
                      <span className="inline-flex items-center justify-center text-[22px] leading-none text-muted-foreground" aria-label={t('altLabel')}>
                        ➖
                      </span>
                    ) : (
                      <span className="w-8 h-8" aria-hidden />
                    )}
                  </div>
                  <div className="flex shrink-0 items-center justify-center w-7 h-7">
                    {cClassId && <ClassIcon classId={cClassId} size={ICON_SIZE} title={c.mainSpec} />}
                  </div>
                  <div className="flex items-center gap-1 min-w-0 sm:col-span-2">
                    <SpecIcon spec={c.mainSpec} size={ICON_SIZE} />
                    {c.offSpec && (
                      <>
                        <span className="text-muted-foreground text-xs font-medium shrink-0">/</span>
                        <span className="grayscale contrast-90 inline-flex shrink-0">
                          <SpecIcon spec={c.offSpec} size={ICON_SIZE} className="opacity-90" />
                        </span>
                      </>
                    )}
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <CharacterDiscordNameHint
                        discordName={c.guildDiscordDisplayName}
                        className="font-medium text-base min-w-0"
                      >
                        {c.name}
                      </CharacterDiscordNameHint>
                      {c.hasBattlenet ? (
                        <span
                          className="shrink-0 rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                          title={t('bnetLinkedBadgeTitle')}
                        >
                          {t('bnetLinkedBadge')}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <span
                    className="text-sm text-muted-foreground truncate min-w-0 hidden sm:block text-center"
                    title={c.guildName ?? undefined}
                  >
                    {c.guildName ?? '–'}
                  </span>
                  <div
                    className="relative flex justify-end shrink-0 col-start-4 row-start-1 sm:col-start-auto sm:row-start-auto"
                    ref={menuOpen ? menuRef : undefined}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(menuOpen ? null : c.id);
                      }}
                      disabled={loading}
                      className="flex h-11 w-11 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted/50 text-foreground hover:bg-muted disabled:opacity-50"
                      aria-label={t('characterMenu')}
                      aria-expanded={menuOpen}
                    >
                      <span className="text-lg leading-none" aria-hidden>
                        ⋮
                      </span>
                    </button>
                    {menuOpen && (
                      <div className="absolute right-0 top-full z-20 mt-1 min-w-[140px] rounded-md border border-border bg-background py-1 shadow-md">
                        {canSetMain(c) && (
                          <button
                            type="button"
                            onClick={() => {
                              handleSetMain(c.id);
                              setOpenMenuId(null);
                            }}
                            disabled={loading}
                            className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                          >
                            {t('setAsMain')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            openEdit(c);
                            setOpenMenuId(null);
                          }}
                          disabled={loading}
                          className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                        >
                          {t('editCharacter')}
                        </button>
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground col-span-4 sm:hidden" title={c.guildName ?? undefined}>
                    {c.guildName ? `${t('guild')}: ${c.guildName}` : '–'}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          ref={openAddButtonRef}
          type="button"
          onClick={openAdd}
          className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
        >
          {t('addCharacter')}
        </button>
      </div>

      {/* Modal: Charakter anlegen oder bearbeiten */}
      {(modalOpen === 'add' || modalOpen === 'edit') && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-character-title"
          onClick={closeModal}
        >
          <div
            ref={modalRef}
            className="bg-background border border-border rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h3 id="modal-character-title" className="text-lg font-semibold">
                {modalOpen === 'add' ? t('addCharacter') : t('editCharacter')}
              </h3>
              <button type="button" onClick={closeModal} className="text-muted-foreground hover:text-foreground p-1" aria-label={t('close')}>×</button>
            </div>
            <form
              onSubmit={modalOpen === 'add' ? handleAdd : handleSaveEdit}
              className="p-4"
            >
              {formContent}
              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  type="submit"
                  disabled={loading || !name.trim() || !classId || !mainSpecId}
                  className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50"
                >
                  {t('save')}
                </button>
                <button type="button" onClick={closeModal} className="rounded border border-input px-4 py-2 text-sm">
                  {t('cancel')}
                </button>
                {modalOpen === 'edit' && editingId && (
                  <button
                    type="button"
                    onClick={() => editingId && handleDelete(editingId)}
                    disabled={loading}
                    className="rounded border border-destructive text-destructive px-4 py-2 text-sm hover:bg-destructive/10"
                  >
                    {t('deleteCharacter')}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
