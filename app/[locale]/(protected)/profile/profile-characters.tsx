'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useMemo } from 'react';
import { SpecIcon } from '@/components/spec-icon';
import { RoleIcon } from '@/components/role-icon';
import {
  TBC_CLASSES,
  getSpecDisplayName,
  getAllSpecDisplayNames,
  type TbcRole,
} from '@/lib/wow-tbc-classes';

type CharacterRow = {
  id: string;
  name: string;
  guildId: string | null;
  guildName: string | null;
  mainSpec: string;
  offSpec: string | null;
};

type GuildOption = { id: string; name: string };

const allSpecs = getAllSpecDisplayNames();

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

  const resetForm = () => {
    setName('');
    setGuildId('');
    setClassId('');
    setMainSpecId('');
    setOffSpecId('');
    setError(null);
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
      const data = await res.json();
      if (res.ok) {
        router.refresh();
        setList((prev) => [...prev, data.character]);
        resetForm();
      } else {
        setError(data.error || t('errorSave'));
      }
    } catch (err) {
      setError(t('errorSave'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (c: CharacterRow) => {
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
      const data = await res.json();
      if (res.ok) {
        router.refresh();
        setList((prev) => prev.map((r) => (r.id === editingId ? data.character : r)));
        setEditingId(null);
        resetForm();
      } else {
        setError(data.error || t('errorSave'));
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
        if (editingId === id) {
          setEditingId(null);
          resetForm();
        }
      } else {
        const data = await res.json();
        setError(data.error || t('errorSave'));
      }
    } finally {
      setLoading(false);
    }
  };

  const roleForSpec = (displayName: string): TbcRole => {
    const s = allSpecs.find((x) => x.displayName === displayName);
    return s?.role ?? 'Melee';
  };

  return (
    <section className="mb-8" aria-labelledby="characters-heading">
      <h2 id="characters-heading" className="text-lg font-semibold text-foreground mb-2">
        {t('characters')}
      </h2>
      <p className="text-muted-foreground text-sm mb-4">{t('charactersDescription')}</p>
      {error && (
        <p className="text-destructive text-sm mb-2" role="alert">
          {error}
        </p>
      )}
      {list.length === 0 ? (
        <p className="text-muted-foreground text-sm mb-4">{t('noCharacters')}</p>
      ) : (
        <ul className="mb-4 space-y-2">
          {list.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-2 p-2 rounded border border-border bg-card text-sm"
            >
              <span className="font-medium">{c.name}</span>
              <span className="text-muted-foreground">{c.guildName ?? '–'}</span>
              <span className="inline-flex items-center gap-1" title={c.mainSpec}>
                <SpecIcon spec={c.mainSpec} size={18} />
                <span>{c.mainSpec}</span>
                <RoleIcon role={roleForSpec(c.mainSpec)} size={14} />
              </span>
              {c.offSpec && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  / <SpecIcon spec={c.offSpec} size={18} />
                  <span>{c.offSpec}</span>
                </span>
              )}
              <button
                type="button"
                onClick={() => handleEdit(c)}
                disabled={loading}
                className="text-primary hover:underline text-xs"
              >
                {t('editCharacter')}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(c.id)}
                disabled={loading}
                className="text-destructive hover:underline text-xs"
              >
                {t('deleteCharacter')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {editingId ? (
        <form onSubmit={handleSaveEdit} className="flex flex-wrap gap-2 items-end mb-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('characterName')}
            className="rounded border border-input bg-background px-2 py-1 w-32"
          />
          <select
            value={guildId}
            onChange={(e) => setGuildId(e.target.value)}
            className="rounded border border-input bg-background px-2 py-1 min-w-[120px]"
          >
            <option value="">–</option>
            {guilds.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setMainSpecId('');
              setOffSpecId('');
            }}
            className="rounded border border-input bg-background px-2 py-1 min-w-[120px]"
          >
            <option value="">{t('class')} …</option>
            {TBC_CLASSES.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
          <select
            value={mainSpecId}
            onChange={(e) => setMainSpecId(e.target.value)}
            className="rounded border border-input bg-background px-2 py-1 min-w-[140px]"
          >
            <option value="">{t('mainSpec')} …</option>
            {mainSpecOptions.map((spec) => (
              <option key={spec.id} value={spec.id}>
                {spec.name} ({spec.role})
              </option>
            ))}
          </select>
          <select
            value={offSpecId}
            onChange={(e) => setOffSpecId(e.target.value)}
            className="rounded border border-input bg-background px-2 py-1 min-w-[140px]"
          >
            <option value="">{t('offSpec')} –</option>
            {mainSpecOptions.map((spec) => (
              <option key={spec.id} value={spec.id} disabled={spec.id === mainSpecId}>
                {spec.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={loading} className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm">
            {t('save')}
          </button>
          <button
            type="button"
            onClick={() => { setEditingId(null); resetForm(); }}
            className="rounded border border-input px-4 py-2 text-sm"
          >
            {t('cancel')}
          </button>
        </form>
      ) : null}
      <form onSubmit={handleAdd} className="flex flex-wrap gap-2 items-end">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('characterName')}
          className="rounded border border-input bg-background px-2 py-1 w-32"
        />
        <select
          value={guildId}
          onChange={(e) => setGuildId(e.target.value)}
          className="rounded border border-input bg-background px-2 py-1 min-w-[120px]"
        >
          <option value="">–</option>
          {guilds.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select
          value={classId}
          onChange={(e) => {
            setClassId(e.target.value);
            setMainSpecId('');
            setOffSpecId('');
          }}
          className="rounded border border-input bg-background px-2 py-1 min-w-[120px]"
        >
          <option value="">{t('class')} …</option>
          {TBC_CLASSES.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name}
            </option>
          ))}
        </select>
        <select
          value={mainSpecId}
          onChange={(e) => setMainSpecId(e.target.value)}
          className="rounded border border-input bg-background px-2 py-1 min-w-[140px]"
        >
          <option value="">{t('mainSpec')} …</option>
          {mainSpecOptions.map((spec) => (
            <option key={spec.id} value={spec.id}>
              {spec.name} ({spec.role})
            </option>
          ))}
        </select>
        <select
          value={offSpecId}
          onChange={(e) => setOffSpecId(e.target.value)}
          className="rounded border border-input bg-background px-2 py-1 min-w-[140px]"
        >
          <option value="">{t('offSpec')} –</option>
          {mainSpecOptions.map((spec) => (
            <option key={spec.id} value={spec.id} disabled={spec.id === mainSpecId}>
              {spec.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={loading || !name.trim() || !classId || !mainSpecId}
          className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50"
        >
          {t('addCharacter')}
        </button>
      </form>
    </section>
  );
}
