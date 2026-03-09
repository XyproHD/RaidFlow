'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { SpecIcon } from '@/components/spec-icon';

type CharacterRow = {
  id: string;
  name: string;
  guildId: string | null;
  guildName: string | null;
  mainSpec: string;
  offSpec: string | null;
};

type GuildOption = { id: string; name: string };

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
  const [mainSpec, setMainSpec] = useState('');
  const [offSpec, setOffSpec] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !mainSpec.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/user/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          guildId: guildId || null,
          mainSpec: mainSpec.trim(),
          offSpec: offSpec.trim() || null,
        }),
      });
      if (res.ok) {
        router.refresh();
        const data = await res.json();
        setList((prev) => [...prev, data.character]);
        setName('');
        setGuildId('');
        setMainSpec('');
        setOffSpec('');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (c: CharacterRow) => {
    setEditingId(c.id);
    setName(c.name);
    setGuildId(c.guildId || '');
    setMainSpec(c.mainSpec);
    setOffSpec(c.offSpec || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !name.trim() || !mainSpec.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/user/characters/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          guildId: guildId || null,
          mainSpec: mainSpec.trim(),
          offSpec: offSpec.trim() || null,
        }),
      });
      if (res.ok) {
        router.refresh();
        const data = await res.json();
        setList((prev) => prev.map((r) => (r.id === editingId ? data.character : r)));
        setEditingId(null);
        setName('');
        setGuildId('');
        setMainSpec('');
        setOffSpec('');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/user/characters/${id}`, { method: 'DELETE' });
      if (res.ok) {
        router.refresh();
        setList((prev) => prev.filter((r) => r.id !== id));
        if (editingId === id) setEditingId(null);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mb-8" aria-labelledby="characters-heading">
      <h2 id="characters-heading" className="text-lg font-semibold text-foreground mb-2">
        {t('characters')}
      </h2>
      <p className="text-muted-foreground text-sm mb-4">{t('charactersDescription')}</p>
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
              <span className="inline-flex items-center gap-1">
                <SpecIcon spec={c.mainSpec} size={18} />
                <span>{c.mainSpec}</span>
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
          <input
            type="text"
            value={mainSpec}
            onChange={(e) => setMainSpec(e.target.value)}
            placeholder={t('mainSpec')}
            className="rounded border border-input bg-background px-2 py-1 w-28"
          />
          <input
            type="text"
            value={offSpec}
            onChange={(e) => setOffSpec(e.target.value)}
            placeholder={t('offSpec')}
            className="rounded border border-input bg-background px-2 py-1 w-28"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm"
          >
            {t('save')}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setName('');
              setGuildId('');
              setMainSpec('');
              setOffSpec('');
            }}
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
        <input
          type="text"
          value={mainSpec}
          onChange={(e) => setMainSpec(e.target.value)}
          placeholder={t('mainSpec')}
          className="rounded border border-input bg-background px-2 py-1 w-28"
        />
        <input
          type="text"
          value={offSpec}
          onChange={(e) => setOffSpec(e.target.value)}
          placeholder={t('offSpec')}
          className="rounded border border-input bg-background px-2 py-1 w-28"
        />
        <button
          type="submit"
          disabled={loading || !name.trim() || !mainSpec.trim()}
          className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50"
        >
          {t('addCharacter')}
        </button>
      </form>
    </section>
  );
}
