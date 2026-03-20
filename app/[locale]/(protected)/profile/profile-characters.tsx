'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { SpecIcon } from '@/components/spec-icon';
import { ClassIcon } from '@/components/class-icon';
import {
  TBC_CLASSES,
  getSpecDisplayName,
  getAllSpecDisplayNames,
} from '@/lib/wow-tbc-classes';
import {
  WOW_VERSION_OPTIONS,
  type WowRealm,
  type WowRegion,
  type WowVersion,
} from '@/lib/wow-classic-realms';

type CharacterRow = {
  id: string;
  name: string;
  guildId: string | null;
  guildName: string | null;
  mainSpec: string;
  offSpec: string | null;
  isMain: boolean;
  classId?: string | null;
};

type GuildOption = { id: string; name: string };

const allSpecs = getAllSpecDisplayNames();

function getClassIdForSpec(displayName: string): string | null {
  const s = allSpecs.find((x) => x.displayName === displayName);
  return s?.classId ?? null;
}

export function ProfileCharacters({
  initialData,
  guilds,
}: {
  initialData: CharacterRow[];
  guilds: GuildOption[];
}) {
  const t = useTranslations('profile');
  const router = useRouter();
  const singleGuild = guilds.length === 1 ? guilds[0] : null;
  const [list, setList] = useState(initialData);
  const [modalOpen, setModalOpen] = useState<'add' | 'edit' | 'auto' | null>(null);
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
  const [autoServer, setAutoServer] = useState('');
  const [autoServerSearch, setAutoServerSearch] = useState('');
  const [autoName, setAutoName] = useState('');
  const [autoGuildId, setAutoGuildId] = useState('');
  const [autoSaveWithoutGuild, setAutoSaveWithoutGuild] = useState(false);
  const [autoRegion, setAutoRegion] = useState<WowRegion | 'all'>('all');
  const [autoWowVersion, setAutoWowVersion] = useState<WowVersion | 'all'>('all');
  const [realmOptions, setRealmOptions] = useState<WowRealm[]>([]);
  const [realmsLoading, setRealmsLoading] = useState(false);

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
  }, []);

  const resetAutoForm = useCallback(() => {
    setAutoServer('');
    setAutoServerSearch('');
    setAutoName('');
    setAutoGuildId('');
    setAutoSaveWithoutGuild(false);
    setAutoRegion('all');
    setAutoWowVersion('all');
    setError(null);
  }, []);

  const openAdd = useCallback(() => {
    setEditingId(null);
    resetForm();
    if (guilds.length >= 1) {
      setGuildId(guilds[0].id);
    }
    setModalOpen('add');
  }, [resetForm, guilds]);

  const openAutoAdd = useCallback(() => {
    setEditingId(null);
    resetAutoForm();
    if (guilds.length >= 1) {
      setAutoGuildId(guilds[0].id);
    }
    setModalOpen('auto');
  }, [resetAutoForm, guilds]);

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
    setError(null);
    setModalOpen('edit');
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(null);
    setEditingId(null);
    resetForm();
    resetAutoForm();
  }, [resetForm, resetAutoForm]);

  useEffect(() => {
    if (modalOpen !== 'add' && modalOpen !== 'edit' && modalOpen !== 'auto') return;
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

  const handleAutoAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!autoServer.trim() || !autoName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/user/characters/auto-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          server: autoServer.trim(),
          name: autoName.trim(),
          guildId: autoGuildId || null,
          region: autoRegion === 'all' ? 'eu' : autoRegion,
          wowVersion: autoWowVersion === 'all' ? null : autoWowVersion,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.character) {
          router.refresh();
          setList((prev) => [...prev, data.character]);
          resetAutoForm();
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
  const realmOptionsByPrefix = useMemo(() => {
    const q = autoServerSearch.trim().toLowerCase();
    if (!q) return realmOptions;
    return realmOptions.filter((realm) => realm.name.toLowerCase().startsWith(q));
  }, [realmOptions, autoServerSearch]);

  useEffect(() => {
    if (modalOpen !== 'auto') return;
    let cancelled = false;

    const loadRealms = async () => {
      setRealmsLoading(true);
      try {
        const params = new URLSearchParams();
        if (autoRegion !== 'all') params.set('region', autoRegion);
        if (autoWowVersion !== 'all') params.set('wowVersion', autoWowVersion);
        const qs = params.toString();
        const res = await fetch(`/api/wow/realms${qs ? `?${qs}` : ''}`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = (await res.json()) as { realms?: WowRealm[] };
        if (!cancelled) {
          setRealmOptions(Array.isArray(data.realms) ? data.realms : []);
        }
      } finally {
        if (!cancelled) setRealmsLoading(false);
      }
    };

    loadRealms();
    return () => {
      cancelled = true;
    };
  }, [modalOpen, autoRegion, autoWowVersion]);

  const formContent = (
    <>
      {error && (
        <p className="text-destructive text-sm mb-2" role="alert">
          {error}
        </p>
      )}
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
        <label className="text-sm font-medium">
          {t('characterName')} <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('characterName')}
          className="rounded border border-input bg-background px-3 py-2 w-full"
        />
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
                    <span className="font-medium text-base truncate min-w-0" title={c.name}>
                      {c.name}
                    </span>
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
        <button
          type="button"
          onClick={openAutoAdd}
          className="rounded border border-input bg-background px-4 py-2 text-sm font-medium"
        >
          {t('autoAddCharacter')}
        </button>
      </div>

      {/* Modal: Charakter anlegen oder bearbeiten */}
      {(modalOpen === 'add' || modalOpen === 'edit' || modalOpen === 'auto') && (
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
                {modalOpen === 'add'
                  ? t('addCharacter')
                  : modalOpen === 'edit'
                  ? t('editCharacter')
                  : t('autoAddCharacter')}
              </h3>
              <button type="button" onClick={closeModal} className="text-muted-foreground hover:text-foreground p-1" aria-label={t('close')}>×</button>
            </div>
            <form
              onSubmit={
                modalOpen === 'add'
                  ? handleAdd
                  : modalOpen === 'edit'
                  ? handleSaveEdit
                  : handleAutoAdd
              }
              className="p-4"
            >
              {modalOpen === 'auto' ? (
                <>
                  {error && (
                    <p className="text-destructive text-sm mb-2" role="alert">
                      {error}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground mb-3">{t('autoAddDescription')}</p>
                  <div className="grid gap-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="grid gap-1">
                        <label className="text-sm font-medium">{t('region')} ({t('optional')})</label>
                        <select
                          value={autoRegion}
                          onChange={(e) => setAutoRegion(e.target.value as WowRegion | 'all')}
                          className="rounded border border-input bg-background px-3 py-2 w-full"
                        >
                          <option value="all">{t('all')}</option>
                          <option value="eu">EU</option>
                          <option value="us">US</option>
                          <option value="kr">KR</option>
                          <option value="tw">TW</option>
                        </select>
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium">{t('wowVersion')} ({t('optional')})</label>
                        <select
                          value={autoWowVersion}
                          onChange={(e) => setAutoWowVersion(e.target.value as WowVersion | 'all')}
                          className="rounded border border-input bg-background px-3 py-2 w-full"
                        >
                          <option value="all">{t('all')}</option>
                          {WOW_VERSION_OPTIONS.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <label className="text-sm font-medium">
                      {t('server')} <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={autoServerSearch}
                      onChange={(e) => setAutoServerSearch(e.target.value)}
                      placeholder={t('serverSearchPlaceholder')}
                      className="rounded border border-input bg-background px-3 py-2 w-full"
                    />
                    <input
                      type="text"
                      value={autoServer}
                      onChange={(e) => setAutoServer(e.target.value)}
                      placeholder={t('serverPlaceholder')}
                      list="realm-options"
                      className="rounded border border-input bg-background px-3 py-2 w-full"
                    />
                    <datalist id="realm-options">
                      {realmOptionsByPrefix.map((realm) => (
                        <option key={`${realm.region}-${realm.slug}`} value={realm.name}>
                          {realm.region.toUpperCase()}
                        </option>
                      ))}
                    </datalist>
                    <p className="text-xs text-muted-foreground">
                      {realmsLoading
                        ? t('loadingRealms')
                        : t('realmFilterHint', { count: realmOptionsByPrefix.length })}
                    </p>
                    <label className="text-sm font-medium">
                      {t('characterName')} <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={autoName}
                      onChange={(e) => setAutoName(e.target.value)}
                      placeholder={t('characterName')}
                      className="rounded border border-input bg-background px-3 py-2 w-full"
                    />
                    {guilds.length > 1 ? (
                      <>
                        <label className="text-sm font-medium">{t('guild')} ({t('optional')})</label>
                        <select
                          value={autoGuildId}
                          onChange={(e) => setAutoGuildId(e.target.value)}
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
                            checked={autoSaveWithoutGuild}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setAutoSaveWithoutGuild(checked);
                              setAutoGuildId(checked ? '' : singleGuild.id);
                            }}
                          />
                          {t('saveWithoutGuild')}
                        </label>
                      </>
                    ) : null}
                  </div>
                </>
              ) : (
                formContent
              )}
              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  type="submit"
                  disabled={
                    loading ||
                    (modalOpen === 'auto'
                      ? !autoServer.trim() || !autoName.trim()
                      : !name.trim() || !classId || !mainSpecId)
                  }
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
