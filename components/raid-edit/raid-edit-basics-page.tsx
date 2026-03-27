'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { RaidEditSerialized } from '@/components/raid-edit/raid-edit-panel';

type Bootstrap = {
  dungeons: { id: string; name: string; maxPlayers: number }[];
  raidGroups: { id: string; name: string }[];
  leaders: { userId: string; label: string }[];
};

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDatetimeLocal(s: string): Date {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function sameStringArray(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function RaidEditBasicsPage({
  guildId,
  raidId,
  initialRaid,
}: {
  guildId: string;
  raidId: string;
  initialRaid: RaidEditSerialized;
}) {
  const tEdit = useTranslations('raidEdit');
  const tDetail = useTranslations('raidDetail');
  const tPlanner = useTranslations('raidPlanner');
  const locale = useLocale();
  const router = useRouter();

  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState(initialRaid.name);
  const [note, setNote] = useState(initialRaid.note ?? '');
  const [raidLeaderId, setRaidLeaderId] = useState(initialRaid.raidLeaderId ?? '');
  const [lootmasterId, setLootmasterId] = useState(initialRaid.lootmasterId ?? '');
  const [raidGroupRestrictionId, setRaidGroupRestrictionId] = useState(initialRaid.raidGroupRestrictionId ?? '');
  const [maxPlayers, setMaxPlayers] = useState(initialRaid.maxPlayers);
  const [signupVisibility, setSignupVisibility] = useState(initialRaid.signupVisibility);
  const [minTanks, setMinTanks] = useState(initialRaid.minTanks);
  const [minMelee, setMinMelee] = useState(initialRaid.minMelee);
  const [minRange, setMinRange] = useState(initialRaid.minRange);
  const [minHealers, setMinHealers] = useState(initialRaid.minHealers);
  const [scheduledAtLocal, setScheduledAtLocal] = useState(() =>
    toDatetimeLocalValue(new Date(initialRaid.scheduledAt))
  );
  const [scheduledEndLocal, setScheduledEndLocal] = useState(() =>
    toDatetimeLocalValue(
      initialRaid.scheduledEndAt ? new Date(initialRaid.scheduledEndAt) : new Date(new Date(initialRaid.scheduledAt).getTime() + 30 * 60 * 1000)
    )
  );
  const [signupDatetimeLocal, setSignupDatetimeLocal] = useState(() =>
    toDatetimeLocalValue(new Date(initialRaid.signupUntil))
  );
  const [selectedDungeons, setSelectedDungeons] = useState<string[]>(() => {
    const fromJson = Array.isArray(initialRaid.dungeonIds)
      ? initialRaid.dungeonIds.map((x) => String(x).trim()).filter(Boolean)
      : [];
    const base = [initialRaid.dungeonId, ...fromJson].filter(Boolean);
    return Array.from(new Set(base));
  });

  const [saving, setSaving] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mustConfirmReset, setMustConfirmReset] = useState(false);
  const [confirmResetChecked, setConfirmResetChecked] = useState(false);
  const editable = initialRaid.status === 'open';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/guilds/${guildId}/raid-planner/bootstrap?locale=${encodeURIComponent(locale)}`);
        const json = (await res.json()) as Bootstrap & { error?: string };
        if (!res.ok) throw new Error(json.error || res.statusText);
        if (!cancelled) {
          setBootstrap(json);
          if (selectedDungeons.length === 0 && json.dungeons.length > 0) {
            setSelectedDungeons([initialRaid.dungeonId || json.dungeons[0].id]);
          }
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guildId, initialRaid.dungeonId, locale, selectedDungeons.length]);

  const origDungeons = useMemo(() => {
    const fromJson = Array.isArray(initialRaid.dungeonIds)
      ? initialRaid.dungeonIds.map((x) => String(x).trim()).filter(Boolean)
      : [];
    return Array.from(new Set([initialRaid.dungeonId, ...fromJson].filter(Boolean)));
  }, [initialRaid.dungeonId, initialRaid.dungeonIds]);

  const scheduledAtNew = parseDatetimeLocal(scheduledAtLocal);
  const scheduleChanged = scheduledAtNew.getTime() !== new Date(initialRaid.scheduledAt).getTime();
  const dungeonChanged = !sameStringArray(selectedDungeons, origDungeons);
  const requiresResetConsent = scheduleChanged || dungeonChanged;

  useEffect(() => {
    setMustConfirmReset(requiresResetConsent);
    if (!requiresResetConsent) setConfirmResetChecked(false);
  }, [requiresResetConsent]);

  async function save() {
    if (selectedDungeons.length === 0) {
      setError(tPlanner('dungeon'));
      return;
    }
    if (mustConfirmReset && !confirmResetChecked) {
      setError(tEdit('resetSignupsWarning'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const primaryDungeon = selectedDungeons[0];
      const body: Record<string, unknown> = {
        name: name.trim(),
        note: note.trim() || null,
        dungeonId: primaryDungeon,
        dungeonIds: selectedDungeons,
        raidLeaderId: raidLeaderId || null,
        lootmasterId: lootmasterId || null,
        raidGroupRestrictionId: raidGroupRestrictionId || null,
        maxPlayers,
        signupVisibility,
        minTanks,
        minMelee,
        minRange,
        minHealers,
        scheduledAt: parseDatetimeLocal(scheduledAtLocal).toISOString(),
        scheduledEndAt: parseDatetimeLocal(scheduledEndLocal).toISOString(),
        signupUntil: parseDatetimeLocal(signupDatetimeLocal).toISOString(),
        confirmResetSignups: mustConfirmReset ? true : undefined,
      };
      const res = await fetch(`/api/guilds/${guildId}/raids/${raidId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || res.statusText);
      router.push(`/${locale}/guild/${guildId}/raid/${raidId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function cancelRaid() {
    if (!window.confirm(tEdit('cancelConfirm'))) return;
    setCancelBusy(true);
    try {
      const res = await fetch(`/api/guilds/${guildId}/raids/${raidId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (!res.ok) throw new Error();
      router.push(`/${locale}/dashboard?guild=${encodeURIComponent(guildId)}`);
      router.refresh();
    } finally {
      setCancelBusy(false);
    }
  }

  async function deleteRaid() {
    if (!window.confirm(tDetail('deleteRaidConfirm'))) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/guilds/${guildId}/raids/${raidId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      router.push(`/${locale}/dashboard?guild=${encodeURIComponent(guildId)}`);
      router.refresh();
    } finally {
      setDeleteBusy(false);
    }
  }

  if (loadError) return <p className="text-sm text-destructive">{loadError}</p>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <section className="rounded-xl border border-border bg-card/50 p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <h1 className="text-xl font-semibold">{tDetail('sectionEdit')}</h1>
          <div className="text-sm text-muted-foreground">✏️</div>
        </div>

        {!editable ? (
          <p className="text-sm text-muted-foreground">⚠️ {tDetail('raidEditClosed')}</p>
        ) : null}

        <fieldset disabled={!editable} className="grid gap-3 sm:grid-cols-2 disabled:opacity-70">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-muted-foreground">{tPlanner('raidName')}</span>
            <input className="rounded-md border border-input bg-background px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <div className="sm:col-span-2 space-y-2">
            <span className="text-sm text-muted-foreground">{tPlanner('dungeon')}</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {(bootstrap?.dungeons ?? []).map((d) => {
                const active = selectedDungeons.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    className={`rounded-md border px-3 py-2 text-left text-sm ${active ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted'}`}
                    onClick={() =>
                      setSelectedDungeons((prev) =>
                        prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id]
                      )
                    }
                  >
                    <span className="mr-2">{active ? '✅' : '⬜'}</span>
                    {d.name}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{tPlanner('raidLeader')}</span>
            <select className="rounded-md border border-input bg-background px-3 py-2" value={raidLeaderId} onChange={(e) => setRaidLeaderId(e.target.value)}>
              <option value="">—</option>
              {(bootstrap?.leaders ?? []).map((l) => (
                <option key={l.userId} value={l.userId}>{l.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{tPlanner('lootmaster')}</span>
            <select className="rounded-md border border-input bg-background px-3 py-2" value={lootmasterId} onChange={(e) => setLootmasterId(e.target.value)}>
              <option value="">—</option>
              {(bootstrap?.leaders ?? []).map((l) => (
                <option key={l.userId} value={l.userId}>{l.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{tPlanner('maxPlayers')}</span>
            <input type="number" min={1} max={40} className="rounded-md border border-input bg-background px-3 py-2" value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{tDetail('visibility')}</span>
            <select className="rounded-md border border-input bg-background px-3 py-2" value={signupVisibility} onChange={(e) => setSignupVisibility(e.target.value)}>
              <option value="public">{tDetail('visibilityPublic')}</option>
              <option value="raid_leader_only">{tDetail('visibilityLeaders')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{tEdit('raidStart')}</span>
            <input type="datetime-local" className="rounded-md border border-input bg-background px-3 py-2" value={scheduledAtLocal} onChange={(e) => setScheduledAtLocal(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{tEdit('raidEnd')}</span>
            <input type="datetime-local" className="rounded-md border border-input bg-background px-3 py-2" value={scheduledEndLocal} onChange={(e) => setScheduledEndLocal(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{tDetail('signupUntil')}</span>
            <input type="datetime-local" className="rounded-md border border-input bg-background px-3 py-2" value={signupDatetimeLocal} onChange={(e) => setSignupDatetimeLocal(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{tDetail('restriction')}</span>
            <select className="rounded-md border border-input bg-background px-3 py-2" value={raidGroupRestrictionId} onChange={(e) => setRaidGroupRestrictionId(e.target.value)}>
              <option value="">—</option>
              {(bootstrap?.raidGroups ?? []).map((rg) => (
                <option key={rg.id} value={rg.id}>{rg.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">🛡 Min Tank</span>
            <input type="number" min={0} className="rounded-md border border-input bg-background px-3 py-2" value={minTanks} onChange={(e) => setMinTanks(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">⚔ Min Melee</span>
            <input type="number" min={0} className="rounded-md border border-input bg-background px-3 py-2" value={minMelee} onChange={(e) => setMinMelee(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">🏹 Min Range</span>
            <input type="number" min={0} className="rounded-md border border-input bg-background px-3 py-2" value={minRange} onChange={(e) => setMinRange(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">💚 Min Healer</span>
            <input type="number" min={0} className="rounded-md border border-input bg-background px-3 py-2" value={minHealers} onChange={(e) => setMinHealers(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-muted-foreground">{tPlanner('note')}</span>
            <textarea className="rounded-md border border-input bg-background px-3 py-2 min-h-[5rem]" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </fieldset>
      </section>

      {mustConfirmReset && editable ? (
        <section className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 space-y-3">
          <p className="text-sm">⚠️ {tEdit('resetSignupsWarning')}</p>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmResetChecked}
              onChange={(e) => setConfirmResetChecked(e.target.checked)}
            />
            <span>{tEdit('confirmReset')}</span>
          </label>
        </section>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <section className="rounded-xl border border-border bg-card/50 p-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving || !editable}
          onClick={() => void save()}
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {saving ? `💾 ${tEdit('saving')}` : `💾 ${tEdit('saveBasics')}`}
        </button>
        <button
          type="button"
          className="rounded-md border border-border px-4 py-2 text-sm"
          onClick={() => router.push(`/${locale}/guild/${guildId}/raid/${raidId}`)}
        >
          ↩ {tEdit('abort')}
        </button>
        <button
          type="button"
          disabled={cancelBusy}
          onClick={() => void cancelRaid()}
          className="rounded-md border border-destructive text-destructive px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {cancelBusy ? '…' : `🚫 ${tEdit('cancelRaid')}`}
        </button>
        <button
          type="button"
          disabled={deleteBusy}
          onClick={() => void deleteRaid()}
          className="rounded-md border border-destructive bg-destructive/10 text-destructive px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {deleteBusy ? '…' : `🗑 ${tDetail('menuDeleteRaid')}`}
        </button>
      </section>
    </div>
  );
}

