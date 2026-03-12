'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ClassIcon } from '@/components/class-icon';
import { SpecIcon } from '@/components/spec-icon';
import { getAllSpecDisplayNames } from '@/lib/wow-tbc-classes';

type RaidGroup = { id: string; name: string; discordRoleId: string | null; sortOrder: number };
type GuildCharacter = { id: string; name: string; mainSpec: string; offSpec: string | null; isMain: boolean };
type Member = {
  id: string;
  userId: string;
  discordId: string;
  raidGroupId: string | null;
  raidGroupName: string | null;
  joinedAt: string;
  characters: GuildCharacter[];
};
type AllowedChannel = {
  id: string;
  discordChannelId: string;
  name: string | null;
  lastValidatedAt: string | null;
};
type DiscordChannel = { id: string; name: string; type: number };

const allSpecs = getAllSpecDisplayNames();
function getClassIdForSpec(displayName: string): string | null {
  const s = allSpecs.find((x) => x.displayName === displayName);
  return s?.classId ?? null;
}

const ICON_SIZE = 24;

export function GuildManagementContent({
  guildId,
  discordGuildId,
}: {
  guildId: string;
  discordGuildId: string;
}) {
  const t = useTranslations('guildManagement');
  const [raidGroups, setRaidGroups] = useState<RaidGroup[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [allowedChannels, setAllowedChannels] = useState<AllowedChannel[]>([]);
  const [discordChannels, setDiscordChannels] = useState<DiscordChannel[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const loadRaidGroups = useCallback(async () => {
    const res = await fetch(`/api/guilds/${guildId}/raid-groups`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    setRaidGroups(data.raidGroups ?? []);
  }, [guildId]);

  const loadMembers = useCallback(async () => {
    const res = await fetch(`/api/guilds/${guildId}/members`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    setMembers(data.members ?? []);
  }, [guildId]);

  const loadAllowedChannels = useCallback(async () => {
    const res = await fetch(`/api/guilds/${guildId}/allowed-channels`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    setAllowedChannels(data.allowedChannels ?? []);
  }, [guildId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([loadRaidGroups(), loadMembers(), loadAllowedChannels()]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadRaidGroups, loadMembers, loadAllowedChannels]);

  const showSaved = () => {
    setSavedMessage(t('saved'));
    setTimeout(() => setSavedMessage(null), 3000);
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <p className="text-muted-foreground">{t('loading')}</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="max-w-5xl mx-auto">
        <p className="text-destructive">
          {t('error')}: {error}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      {savedMessage && (
        <p className="text-sm text-green-600 dark:text-green-400" role="status">
          {savedMessage}
        </p>
      )}

      <RaidGroupsSection
        guildId={guildId}
        raidGroups={raidGroups}
        members={members}
        onUpdate={() => { loadRaidGroups(); loadMembers(); }}
        onSaved={showSaved}
      />

      <MembersSection
        guildId={guildId}
        members={members}
        raidGroups={raidGroups}
        onUpdate={loadMembers}
        onSaved={showSaved}
      />

      <ChannelsSection
        guildId={guildId}
        discordGuildId={discordGuildId}
        allowedChannels={allowedChannels}
        discordChannels={discordChannels}
        setDiscordChannels={setDiscordChannels}
        onUpdate={loadAllowedChannels}
        onSaved={showSaved}
      />
    </div>
  );
}

function RaidGroupsSection({
  guildId,
  raidGroups,
  members,
  onUpdate,
  onSaved,
}: {
  guildId: string;
  raidGroups: RaidGroup[];
  members: Member[];
  onUpdate: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('guildManagement');
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch(`/api/guilds/${guildId}/raid-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.detail || res.statusText);
      setNewName('');
      setAddOpen(false);
      await onUpdate();
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch(`/api/guilds/${guildId}/raid-groups/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.detail || res.statusText);
      setEditId(null);
      await onUpdate();
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Raidgruppe „${name}" wirklich löschen?`)) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch(`/api/guilds/${guildId}/raid-groups/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || res.statusText);
      }
      await onUpdate();
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveFromGroup = async (memberId: string) => {
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch(`/api/guilds/${guildId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, raidGroupId: null }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || res.statusText);
      }
      await onUpdate();
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const membersByGroup = new Map<string | null, Member[]>();
  for (const m of members) {
    const key = m.raidGroupId ?? '__none__';
    if (!membersByGroup.has(key)) membersByGroup.set(key, []);
    membersByGroup.get(key)!.push(m);
  }

  return (
    <section aria-labelledby="raid-groups-heading">
      <h2 id="raid-groups-heading" className="text-lg font-semibold text-foreground mb-1">
        {t('raidGroups')}
      </h2>
      <p className="text-sm text-muted-foreground mb-4">{t('raidGroupsDescription')}</p>
      {err && (
        <p className="text-sm text-destructive mb-2" role="alert">
          {err}
        </p>
      )}
      {!addOpen ? (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90 mb-4 min-w-[10rem]"
        >
          {t('addRaidGroup')}
        </button>
      ) : (
        <form onSubmit={handleCreate} className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('raidGroupName')}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm w-full min-w-0 sm:w-48"
            disabled={submitting}
          />
          <button
            type="submit"
            disabled={submitting || !newName.trim()}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-50 min-w-[8rem]"
          >
            {submitting ? t('loading') : t('createGroup')}
          </button>
          <button
            type="button"
            onClick={() => { setAddOpen(false); setErr(null); }}
            className="rounded-md border border-input px-4 py-2.5 text-sm min-w-[6rem]"
            disabled={submitting}
          >
            {t('cancel')}
          </button>
        </form>
      )}
      <ul className="space-y-6">
        {raidGroups.length === 0 && membersByGroup.get('__none__')?.length === 0 && (
          <li className="text-muted-foreground text-sm">{t('noRaidGroups')}</li>
        )}
        {raidGroups.map((g) => {
          const groupMembers = membersByGroup.get(g.id) ?? [];
          return (
            <li key={g.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {editId === g.id ? (
                  <>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="rounded-md border border-input bg-background px-3 py-1.5 text-sm w-full min-w-0 sm:w-40"
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      onClick={() => handleUpdate(g.id)}
                      disabled={submitting || !editName.trim()}
                      className="text-sm text-primary hover:underline disabled:opacity-50 min-w-[4rem]"
                    >
                      {t('save')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditId(null); setErr(null); }}
                      className="text-sm text-muted-foreground hover:underline"
                      disabled={submitting}
                    >
                      {t('cancel')}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="font-medium">{g.name}</span>
                    <button
                      type="button"
                      onClick={() => { setEditId(g.id); setEditName(g.name); }}
                      className="text-sm text-primary hover:underline min-w-[4rem]"
                    >
                      {t('editRaidGroup')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(g.id, g.name)}
                      className="text-sm text-destructive hover:underline min-w-[4rem]"
                      disabled={submitting}
                    >
                      {t('deleteRaidGroup')}
                    </button>
                  </>
                )}
              </div>
              <ul className="space-y-2">
                {groupMembers.length === 0 ? (
                  <li className="text-muted-foreground text-sm pl-0">—</li>
                ) : (
                  groupMembers.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-2">
                      <div className="flex-1 min-w-0 flex flex-wrap gap-2">
                        {m.characters.length === 0 ? (
                          <span className="text-muted-foreground text-sm">{m.discordId}</span>
                        ) : (
                          m.characters.map((ch) => (
                            <CharacterCard key={ch.id} ch={ch} />
                          ))
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFromGroup(m.id)}
                        disabled={submitting}
                        className="shrink-0 p-1.5 rounded text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        title={t('removeFromGroup')}
                        aria-label={t('removeFromGroup')}
                      >
                        <span aria-hidden>⛔</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </li>
          );
        })}
        {(membersByGroup.get('__none__')?.length ?? 0) > 0 && (
          <li className="rounded-lg border border-border bg-muted/30 p-4">
            <span className="text-sm font-medium text-muted-foreground">{t('noGroup')}</span>
            <ul className="mt-2 space-y-2">
              {membersByGroup.get('__none__')!.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-0 flex flex-wrap gap-2">
                    {m.characters.length === 0 ? (
                      <span className="text-muted-foreground text-sm">{m.discordId}</span>
                    ) : (
                      m.characters.map((ch) => <CharacterCard key={ch.id} ch={ch} />)
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </li>
        )}
      </ul>
    </section>
  );
}

function CharacterCard({ ch }: { ch: GuildCharacter }) {
  const classId = getClassIdForSpec(ch.mainSpec);
  return (
    <div
      className="grid items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm min-w-[12rem]"
      style={{ gridTemplateColumns: `${ICON_SIZE + 4}px auto 1fr` }}
    >
      <div className="flex shrink-0 items-center justify-center w-7 h-7">
        {classId && <ClassIcon classId={classId} size={ICON_SIZE} title={ch.mainSpec} />}
      </div>
      <div className="flex shrink-0 items-center gap-1 min-w-0">
        <SpecIcon spec={ch.mainSpec} size={ICON_SIZE} />
        {ch.offSpec && (
          <>
            <span className="text-muted-foreground text-xs">/</span>
            <span className="grayscale contrast-90 inline-flex">
              <SpecIcon spec={ch.offSpec} size={ICON_SIZE} className="opacity-90" />
            </span>
          </>
        )}
      </div>
      <span className="font-medium text-sm truncate min-w-0" title={ch.name}>
        {ch.name}
      </span>
    </div>
  );
}

function MembersSection({
  guildId,
  members,
  raidGroups,
  onUpdate,
  onSaved,
}: {
  guildId: string;
  members: Member[];
  raidGroups: RaidGroup[];
  onUpdate: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('guildManagement');
  const [assigning, setAssigning] = useState<string | null>(null);
  const [popupMemberId, setPopupMemberId] = useState<string | null>(null);
  const [popupSelectedId, setPopupSelectedId] = useState<string | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popupMemberId) return;
    const close = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setPopupMemberId(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [popupMemberId]);

  const handleSaveAssignment = async (memberId: string, raidGroupId: string | null) => {
    setAssigning(memberId);
    try {
      const res = await fetch(`/api/guilds/${guildId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, raidGroupId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || res.statusText);
      }
      setPopupMemberId(null);
      await onUpdate();
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setAssigning(null);
    }
  };

  const openPopup = (m: Member) => {
    setPopupMemberId(m.id);
    setPopupSelectedId(m.raidGroupId);
  };

  if (members.length === 0) {
    return (
      <section aria-labelledby="members-heading">
        <h2 id="members-heading" className="text-lg font-semibold text-foreground mb-1">
          {t('members')}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">{t('membersDescription')}</p>
        <p className="text-muted-foreground text-sm">{t('noMembers')}</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="members-heading">
      <h2 id="members-heading" className="text-lg font-semibold text-foreground mb-1">
        {t('members')}
      </h2>
      <p className="text-sm text-muted-foreground mb-4">{t('membersDescription')}</p>
      <ul className="space-y-3">
        {members.map((m) => (
          <li
            key={m.id}
            className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-border bg-card p-3 shadow-sm"
          >
            <div className="flex-1 min-w-0 flex flex-wrap gap-2">
              {m.characters.length === 0 ? (
                <span className="text-muted-foreground text-sm">{m.discordId}</span>
              ) : (
                m.characters.map((ch) => <CharacterCard key={ch.id} ch={ch} />)
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <span
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground max-w-[12rem] truncate"
                title={m.raidGroupName ?? undefined}
              >
                {m.raidGroupName ?? t('noGroup')}
              </span>
              <div className="relative" ref={popupMemberId === m.id ? popupRef : undefined}>
                <button
                  type="button"
                  onClick={() => openPopup(m)}
                  disabled={assigning === m.id}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted/50 text-foreground hover:bg-muted disabled:opacity-50 min-w-[2.25rem]"
                  title={t('assignGroups')}
                  aria-label={t('assignGroups')}
                  aria-expanded={popupMemberId === m.id}
                >
                  <span aria-hidden>➕</span>
                </button>
                {popupMemberId === m.id && (
                  <div className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded-md border border-border bg-background py-2 shadow-lg">
                    <p className="px-3 py-1 text-xs text-muted-foreground border-b border-border mb-2">
                      {t('assignGroups')}
                    </p>
                    <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer">
                      <input
                        type="radio"
                        name={`group-${m.id}`}
                        checked={popupSelectedId === null}
                        onChange={() => setPopupSelectedId(null)}
                        className="rounded-full"
                      />
                      <span className="text-sm">{t('noGroup')}</span>
                    </label>
                    {raidGroups.map((rg) => (
                      <label
                        key={rg.id}
                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name={`group-${m.id}`}
                          checked={popupSelectedId === rg.id}
                          onChange={() => setPopupSelectedId(rg.id)}
                          className="rounded-full"
                        />
                        <span className="text-sm">{rg.name}</span>
                      </label>
                    ))}
                    <div className="mt-2 pt-2 border-t border-border px-3">
                      <button
                        type="button"
                        onClick={() => handleSaveAssignment(m.id, popupSelectedId)}
                        disabled={assigning === m.id}
                        className="w-full rounded bg-primary text-primary-foreground px-3 py-2 text-sm font-medium disabled:opacity-50 min-w-[6rem]"
                      >
                        {assigning === m.id ? t('loading') : t('save')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChannelsSection({
  guildId,
  discordGuildId,
  allowedChannels,
  discordChannels,
  setDiscordChannels,
  onUpdate,
  onSaved,
}: {
  guildId: string;
  discordGuildId: string;
  allowedChannels: AllowedChannel[];
  discordChannels: DiscordChannel[] | null;
  setDiscordChannels: (ch: DiscordChannel[] | null) => void;
  onUpdate: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('guildManagement');
  const [fetching, setFetching] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleFetchChannels = async () => {
    setFetching(true);
    setErr(null);
    try {
      const res = await fetch(`/api/discord/guilds/${discordGuildId}/channels`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.detail || res.statusText);
      setDiscordChannels(data.channels ?? []);
      setSelectedIds(new Set(allowedChannels.map((c) => c.discordChannelId)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setFetching(false);
    }
  };

  const toggleChannel = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveChannels = async () => {
    if (selectedIds.size === 0 && allowedChannels.length === 0) return;
    setSaving(true);
    setErr(null);
    try {
      const channels = Array.from(selectedIds).map((id) => {
        const ch = discordChannels?.find((c) => c.id === id);
        return { discordChannelId: id, name: ch?.name ?? null };
      });
      const res = await fetch(`/api/guilds/${guildId}/allowed-channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      await onUpdate();
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="channels-heading">
      <h2 id="channels-heading" className="text-lg font-semibold text-foreground mb-1">
        {t('readChannels')}
      </h2>
      <p className="text-sm text-muted-foreground mb-4">{t('readChannelsDescription')}</p>
      {err && (
        <p className="text-sm text-destructive mb-2" role="alert">
          {err}
        </p>
      )}
      <div className="mb-4">
        <button
          type="button"
          onClick={handleFetchChannels}
          disabled={fetching}
          className="rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 min-w-[10rem]"
        >
          {fetching ? t('loading') : t('fetchChannels')}
        </button>
      </div>
      <h3 className="text-sm font-medium text-foreground mb-2">{t('allowedChannels')}</h3>
      <p className="text-sm text-muted-foreground mb-2">{t('allowedChannelsDescription')}</p>
      {discordChannels === null ? (
        <p className="text-muted-foreground text-sm">{t('noChannelsFetched')}</p>
      ) : discordChannels.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('noChannelsFetched')}</p>
      ) : (
        <>
          <ul className="space-y-1 mb-4 max-h-48 overflow-y-auto border border-border rounded-md p-2">
            {discordChannels.map((ch) => (
              <li key={ch.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`ch-${ch.id}`}
                  checked={selectedIds.has(ch.id)}
                  onChange={() => toggleChannel(ch.id)}
                  className="rounded border-input"
                />
                <label htmlFor={`ch-${ch.id}`} className="text-sm cursor-pointer">
                  #{ch.name}
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={handleSaveChannels}
            disabled={saving || selectedIds.size === 0}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-50 min-w-[10rem]"
          >
            {saving ? t('loading') : t('saveChannels')}
          </button>
        </>
      )}
      {allowedChannels.length > 0 && (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground mb-1">
            {t('savedAllowedList')}: {allowedChannels.map((c) => c.name ?? c.discordChannelId).join(', ')}
          </p>
        </div>
      )}
    </section>
  );
}
