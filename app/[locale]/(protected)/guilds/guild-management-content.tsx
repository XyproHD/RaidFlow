'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';

type RaidGroup = { id: string; name: string; discordRoleId: string | null; sortOrder: number };
type Member = {
  id: string;
  userId: string;
  discordId: string;
  raidGroupId: string | null;
  raidGroupName: string | null;
  joinedAt: string;
};
type AllowedChannel = {
  id: string;
  discordChannelId: string;
  name: string | null;
  lastValidatedAt: string | null;
};
type DiscordChannel = { id: string; name: string; type: number };

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
    return <p className="text-muted-foreground">{t('loading')}</p>;
  }
  if (error) {
    return (
      <p className="text-destructive">
        {t('error')}: {error}
      </p>
    );
  }

  return (
    <div className="space-y-10">
      {savedMessage && (
        <p className="text-sm text-green-600 dark:text-green-400" role="status">
          {savedMessage}
        </p>
      )}

      <RaidGroupsSection
        guildId={guildId}
        raidGroups={raidGroups}
        onUpdate={loadRaidGroups}
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
  onUpdate,
  onSaved,
}: {
  guildId: string;
  raidGroups: RaidGroup[];
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
      const res = await fetch(`/api/guilds/${guildId}/raid-groups/${id}`, {
        method: 'DELETE',
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
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 mb-4"
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
            className="rounded-md border border-input bg-background px-3 py-2 text-sm w-48"
            disabled={submitting}
          />
          <button
            type="submit"
            disabled={submitting || !newName.trim()}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {submitting ? t('loading') : t('save')}
          </button>
          <button
            type="button"
            onClick={() => { setAddOpen(false); setErr(null); }}
            className="rounded-md border border-input px-4 py-2 text-sm"
            disabled={submitting}
          >
            {t('cancel')}
          </button>
        </form>
      )}
      <ul className="space-y-2">
        {raidGroups.length === 0 ? (
          <li className="text-muted-foreground text-sm">{t('noRaidGroups')}</li>
        ) : (
          raidGroups.map((g) => (
            <li
              key={g.id}
              className="flex flex-wrap items-center gap-2 py-2 border-b border-border last:border-0"
            >
              {editId === g.id ? (
                <>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-sm w-40"
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => handleUpdate(g.id)}
                    disabled={submitting || !editName.trim()}
                    className="text-sm text-primary hover:underline disabled:opacity-50"
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
                    className="text-sm text-primary hover:underline"
                  >
                    {t('editRaidGroup')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(g.id, g.name)}
                    className="text-sm text-destructive hover:underline"
                    disabled={submitting}
                  >
                    {t('deleteRaidGroup')}
                  </button>
                </>
              )}
            </li>
          ))
        )}
      </ul>
    </section>
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
  const [pendingGroupByMember, setPendingGroupByMember] = useState<Record<string, string | null>>({});

  const handleSaveAssignment = async (memberId: string) => {
    const raidGroupId = pendingGroupByMember[memberId] ?? members.find((m) => m.id === memberId)?.raidGroupId ?? null;
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
      setPendingGroupByMember((prev) => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });
      await onUpdate();
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setAssigning(null);
    }
  };

  const setMemberGroup = (memberId: string, raidGroupId: string | null) => {
    setPendingGroupByMember((prev) => ({ ...prev, [memberId]: raidGroupId }));
  };

  return (
    <section aria-labelledby="members-heading">
      <h2 id="members-heading" className="text-lg font-semibold text-foreground mb-1">
        {t('members')}
      </h2>
      <p className="text-sm text-muted-foreground mb-4">{t('membersDescription')}</p>
      {members.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('noMembers')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 font-medium">{t('memberDiscordId')}</th>
                <th className="text-left py-2 font-medium">{t('raidGroup')}</th>
                <th className="w-32" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const currentGroupId = pendingGroupByMember[m.id] ?? m.raidGroupId ?? '';
                return (
                  <tr key={m.id} className="border-b border-border">
                    <td className="py-2">{m.discordId}</td>
                    <td className="py-2">
                      <select
                        value={currentGroupId}
                        onChange={(e) => setMemberGroup(m.id, e.target.value || null)}
                        className="rounded border border-input bg-background px-2 py-1 w-full max-w-[200px]"
                      >
                        <option value="">{t('noGroup')}</option>
                        {raidGroups.map((rg) => (
                          <option key={rg.id} value={rg.id}>
                            {rg.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => handleSaveAssignment(m.id)}
                        disabled={assigning === m.id}
                        className="text-primary hover:underline text-sm disabled:opacity-50"
                      >
                        {assigning === m.id ? t('loading') : t('saveGroupAssignment')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
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
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
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
