'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useMemo, useCallback } from 'react';
import { SpecIcon } from '@/components/spec-icon';
import { ClassIcon } from '@/components/class-icon';
import {
  TBC_CLASSES,
  getSpecDisplayName,
  getAllSpecDisplayNames,
} from '@/lib/wow-tbc-classes';

type CharacterRow = {
  id: string;
  name: string;
  guildId: string | null;
  guildName: string | null;
  mainSpec: string;
  offSpec: string | null;
  isMain: boolean;
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
  const [list, setList] = useState(initialData);
  const [modalOpen, setModalOpen] = useState<'add' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [guildId, setGuildId] = useState('');
  const [classId, setClassId] = useState('');
  const [mainSpecId, setMainSpecId] = useState('');
  const [offSpecId, setOffSpecId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mainSpecOptions = useMemo(() => {
    if (!classId) return [];
    return TBC_CLASSES.find((c) => c.id === classId)?.specs ?? [];
  }, [classId]);

  const resetForm = useCallback(() => {
    setName('');
    setGuildId('');
    setClassId('');
    setMainSpecId('');
    setOffSpecId('');
    setError(null);
  }, []);

  const openAdd = useCallback(() => {
    setEditingId(null);
    resetForm();
    setModalOpen('add');
  }, [resetForm]);

  const openEdit = useCallback((c: CharacterRow) => {
    setModalOpen(null);
    setEditingId(c.id);
    setName(c.name);
    setGuildId(c.guildId || '');
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
  }, []);

  const closeEdit = useCallback(() => {
    setEditingId(null);
    resetForm();
  }, [resetForm]);

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
        setList((prev) =>
          prev.map((r) => {
            if (r.id === id) return { ...r, isMain: true };
            const char = prev.find((x) => x.id === id);
            if (char?.guildId && r.guildId === char.guildId) return { ...r, isMain: false };
            return r;
          })
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
        closeEdit();
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
        if (editingId === id) closeEdit();
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

  const selectedMainSpecDisplay = classId && mainSpecId ? getSpecDisplayName(classId, mainSpecId) : null;
  const selectedOffSpecDisplay = classId && offSpecId ? getSpecDisplayName(classId, offSpecId) : null;

  const formContent = (
    <>
      {error && (
        <p className="text-destructive text-sm mb-2" role="alert">
          {error}
        </p>
      )}
      {/* Auswahlvorschau mit Icons */}
      {(classId || selectedMainSpecDisplay) && (
        <div className="flex flex-wrap items-center gap-3 mb-3 p-2 rounded-lg bg-muted/30 border border-border">
          {classId && (
            <span className="inline-flex items-center gap-1.5">
              <ClassIcon classId={classId} size={24} title={TBC_CLASSES.find((c) => c.id === classId)?.name} />
              <span className="text-sm font-medium">{TBC_CLASSES.find((c) => c.id === classId)?.name}</span>
            </span>
          )}
          {selectedMainSpecDisplay && (
            <span className="inline-flex items-center gap-1.5">
              <SpecIcon spec={selectedMainSpecDisplay} size={20} />
              <span className="text-sm text-muted-foreground">{selectedMainSpecDisplay}</span>
            </span>
          )}
          {selectedOffSpecDisplay && (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <SpecIcon spec={selectedOffSpecDisplay} size={18} />
              <span className="text-sm">({selectedOffSpecDisplay})</span>
            </span>
          )}
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
        <label className="text-sm font-medium">{t('guild')} ({t('optional')})</label>
        <select
          value={guildId}
          onChange={(e) => setGuildId(e.target.value)}
          className="rounded border border-input bg-background px-3 py-2 w-full"
        >
          <option value="">–</option>
          {guilds.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
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
      <div className="mb-4 space-y-2">
        {list.map((c) => {
          const cClassId = getClassIdForSpec(c.mainSpec);
          const twinkLabel = c.guildId && !c.isMain && charsInSameGuild(c.guildId).length > 1;
          return (
            <div
              key={c.id}
              className="grid items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm"
              style={{ gridTemplateColumns: '32px 24px minmax(80px, 1fr) 28px 100px 88px' }}
            >
              <div className="flex shrink-0 items-center justify-center w-8 h-8">
                {cClassId && <ClassIcon classId={cClassId} size={24} title={c.mainSpec} />}
              </div>
              <div className="flex shrink-0 items-center w-6">
                <SpecIcon spec={c.mainSpec} size={20} />
              </div>
              <span className="font-medium truncate min-w-0" title={c.name}>
                {c.name}
                {twinkLabel && <span className="ml-1 text-muted-foreground/80 text-sm">(Twink)</span>}
                {c.isMain && c.guildId && <span className="ml-1 font-medium text-foreground text-sm">(Main)</span>}
              </span>
              <div className="flex shrink-0 items-center justify-center w-7">
                {c.offSpec ? <SpecIcon spec={c.offSpec} size={16} /> : null}
              </div>
              <div className="min-w-0">
                {canSetMain(c) ? (
                  <button
                    type="button"
                    onClick={() => handleSetMain(c.id)}
                    disabled={loading}
                    className="w-full min-w-[100px] rounded border border-input bg-muted/50 px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    {t('setAsMain')}
                  </button>
                ) : (
                  <span className="inline-block w-full min-w-[100px]" aria-hidden />
                )}
              </div>
              <button
                type="button"
                onClick={() => openEdit(c)}
                disabled={loading}
                className="w-full min-w-[88px] rounded border border-input bg-muted/50 px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                {t('editCharacter')}
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={openAdd}
        className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
      >
        {t('addCharacter')}
      </button>

      {/* Modal: Neuer Charakter */}
      {modalOpen === 'add' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-labelledby="modal-add-title">
          <div className="bg-background border border-border rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h3 id="modal-add-title" className="text-lg font-semibold">{t('addCharacter')}</h3>
              <button type="button" onClick={() => { setModalOpen(null); resetForm(); }} className="text-muted-foreground hover:text-foreground p-1" aria-label={t('close')}>×</button>
            </div>
            <form onSubmit={handleAdd} className="p-4">
              {formContent}
              <div className="flex gap-2 mt-4">
                <button type="submit" disabled={loading || !name.trim() || !classId || !mainSpecId} className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50">
                  {t('save')}
                </button>
                <button type="button" onClick={() => { setModalOpen(null); resetForm(); }} className="rounded border border-input px-4 py-2 text-sm">
                  {t('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inline-Bereich: Charakter bearbeiten (mit Löschen) */}
      {editingId && (
        <div className="mt-4 p-4 rounded-lg border border-border bg-muted/20">
          <h3 className="text-sm font-semibold mb-3">{t('editCharacter')}</h3>
          <form onSubmit={handleSaveEdit}>
            {formContent}
            <div className="flex flex-wrap gap-2 mt-4">
              <button type="submit" disabled={loading} className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm">
                {t('save')}
              </button>
              <button type="button" onClick={closeEdit} className="rounded border border-input px-4 py-2 text-sm">
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={() => editingId && handleDelete(editingId)}
                disabled={loading}
                className="rounded border border-destructive text-destructive px-4 py-2 text-sm hover:bg-destructive/10"
              >
                {t('deleteCharacter')}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
