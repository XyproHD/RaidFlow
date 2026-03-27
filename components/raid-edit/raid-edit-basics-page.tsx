'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { TIME_SLOTS_30MIN } from '@/lib/profile-constants';
import {
  addMinutes,
  expandSlotIndicesForward,
  raidSlotToLocalDate,
  slotStringsForIndices,
} from '@/lib/raid-planner-time';
import { getAllSpecDisplayNames } from '@/lib/wow-tbc-classes';
import { RoleIcon } from '@/components/role-icon';
import { SpecIcon } from '@/components/spec-icon';
import type { RaidEditSerialized } from '@/components/raid-edit/raid-edit-panel';

const ALL_SPECS = getAllSpecDisplayNames();
const SLOTS = TIME_SLOTS_30MIN as readonly string[];

type Bootstrap = {
  dungeons: { id: string; name: string; maxPlayers: number }[];
  raidGroups: { id: string; name: string }[];
  allowedChannels: { id: string; discordChannelId: string; name: string | null }[];
  leaders: { userId: string; label: string }[];
};

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function parseDatetimeLocal(s: string): Date {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function slotFromDate(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const x = `${h}:${m}`;
  return SLOTS.includes(x) ? x : '19:00';
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
  const [discordChannelId, setDiscordChannelId] = useState(initialRaid.discordChannelId ?? '');
  const [createDiscordThread, setCreateDiscordThread] = useState(!!initialRaid.discordThreadId);
  const [signupVisibility, setSignupVisibility] = useState(initialRaid.signupVisibility);
  const [minTanks, setMinTanks] = useState(initialRaid.minTanks);
  const [minMelee, setMinMelee] = useState(initialRaid.minMelee);
  const [minRange, setMinRange] = useState(initialRaid.minRange);
  const [minHealers, setMinHealers] = useState(initialRaid.minHealers);
  const [minSpecRows, setMinSpecRows] = useState<{ spec: string; count: number }[]>(() => {
    const src =
      initialRaid.minSpecs && typeof initialRaid.minSpecs === 'object' && !Array.isArray(initialRaid.minSpecs)
        ? (initialRaid.minSpecs as Record<string, number>)
        : {};
    return Object.entries(src).map(([spec, count]) => ({ spec, count }));
  });

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
  const [showPlan, setShowPlan] = useState(false);
  const editable = initialRaid.status === 'open';

  const initialStart = new Date(initialRaid.scheduledAt);
  const initialEnd = initialRaid.scheduledEndAt ? new Date(initialRaid.scheduledEndAt) : addMinutes(initialStart, 30);
  const [scheduledDate, setScheduledDate] = useState(() => toYmd(initialStart));
  const [rangeStartIdx, setRangeStartIdx] = useState(() => Math.max(0, SLOTS.indexOf(slotFromDate(initialStart))));
  const [rangeEndIdx, setRangeEndIdx] = useState(() => {
    const endMinus = addMinutes(initialEnd, -30);
    return Math.max(0, SLOTS.indexOf(slotFromDate(endMinus)));
  });
  const [pickingEnd, setPickingEnd] = useState(false);

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

  useEffect(() => {
    const idx = pickingEnd
      ? [rangeStartIdx]
      : expandSlotIndicesForward(rangeStartIdx, rangeEndIdx);
    const slots = slotStringsForIndices(idx);
    const start = raidSlotToLocalDate(scheduledDate, slots[0] ?? '19:00');
    const end = addMinutes(raidSlotToLocalDate(scheduledDate, slots[slots.length - 1] ?? '19:00'), 30);
    setScheduledAtLocal(toDatetimeLocalValue(start));
    setScheduledEndLocal(toDatetimeLocalValue(end));
  }, [scheduledDate, rangeStartIdx, rangeEndIdx, pickingEnd]);

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
        discordChannelId: createDiscordThread ? discordChannelId || null : null,
        createDiscordThread,
        signupVisibility,
        minTanks,
        minMelee,
        minRange,
        minHealers,
        minSpecs: Object.fromEntries(
          minSpecRows
            .filter((r) => r.spec && Number.isFinite(r.count) && r.count > 0)
            .map((r) => [r.spec, Math.floor(r.count)])
        ),
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
                      setSelectedDungeons((prev) => {
                        let next = prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id];
                        if (next.length === 0) next = prev;
                        const selected = (bootstrap?.dungeons ?? []).filter((x) => next.includes(x.id));
                        const mx = selected.reduce((m, x) => Math.max(m, x.maxPlayers), 0);
                        if (mx > 0) setMaxPlayers(mx);
                        return next;
                      })
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
            <input type="number" min={1} max={40} className="rounded-md border border-input bg-background px-3 py-2" value={maxPlayers} readOnly aria-readonly="true" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{tDetail('visibility')}</span>
            <select className="rounded-md border border-input bg-background px-3 py-2" value={signupVisibility} onChange={(e) => setSignupVisibility(e.target.value)}>
              <option value="public">{tDetail('visibilityPublic')}</option>
              <option value="raid_leader_only">{tDetail('visibilityLeaders')}</option>
            </select>
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
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-muted-foreground">{tPlanner('note')}</span>
            <textarea className="rounded-md border border-input bg-background px-3 py-2 min-h-[5rem]" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>

          <div className="sm:col-span-2 space-y-3 rounded-xl border border-border bg-card p-3">
            <h3 className="text-sm font-semibold">{tPlanner('sectionMinimum')}</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {(
                [
                  { role: 'Tank', v: minTanks, set: setMinTanks, k: 'minTanks' },
                  { role: 'Healer', v: minHealers, set: setMinHealers, k: 'minHealers' },
                  { role: 'Melee', v: minMelee, set: setMinMelee, k: 'minMelee' },
                  { role: 'Range', v: minRange, set: setMinRange, k: 'minRange' },
                ] as const
              ).map((r) => (
                <label key={r.role} className="flex flex-col items-center gap-1 rounded-lg border border-border bg-muted/20 p-2">
                  <RoleIcon role={r.role} size={22} />
                  <span className="text-xs text-muted-foreground">{tPlanner(r.k)}</span>
                  <input
                    type="number"
                    min={0}
                    max={25}
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-center text-sm"
                    value={r.v}
                    onChange={(e) => r.set(Number(e.target.value))}
                  />
                </label>
              ))}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{tPlanner('minSpecs')}</span>
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => setMinSpecRows((rows) => [...rows, { spec: ALL_SPECS[0]?.displayName ?? '', count: 1 }])}
                >
                  {tPlanner('addMinSpec')}
                </button>
              </div>
              {minSpecRows.map((row, idx) => (
                <div key={`${row.spec}-${idx}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/15 px-2 py-1.5">
                  <SpecIcon spec={row.spec} size={20} />
                  <select
                    className="flex-1 min-w-[170px] rounded-md border border-input bg-background px-2 py-1 text-sm"
                    value={row.spec}
                    onChange={(e) =>
                      setMinSpecRows((rows) => rows.map((x, i) => (i === idx ? { ...x, spec: e.target.value } : x)))
                    }
                  >
                    {ALL_SPECS.map((s) => (
                      <option key={s.displayName} value={s.displayName}>
                        {s.displayName}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className="w-16 rounded-md border border-input bg-background px-2 py-1 text-sm text-center"
                    value={row.count}
                    onChange={(e) =>
                      setMinSpecRows((rows) => rows.map((x, i) => (i === idx ? { ...x, count: Number(e.target.value) } : x)))
                    }
                  />
                  <button
                    type="button"
                    className="text-sm text-destructive hover:underline"
                    onClick={() => setMinSpecRows((rows) => rows.filter((_, i) => i !== idx))}
                  >
                    {tPlanner('remove')}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="sm:col-span-2 space-y-3 rounded-xl border border-border bg-card p-3">
            <h3 className="text-sm font-semibold">{tPlanner('sectionDiscord')}</h3>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{tPlanner('threadChannel')}</span>
              <select className="rounded-md border border-input bg-background px-3 py-2" value={discordChannelId} onChange={(e) => setDiscordChannelId(e.target.value)}>
                <option value="">{tPlanner('channelPlaceholder')}</option>
                {(bootstrap?.allowedChannels ?? []).map((ch) => (
                  <option key={ch.id} value={ch.discordChannelId}>
                    {ch.name || ch.discordChannelId}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={createDiscordThread} onChange={(e) => setCreateDiscordThread(e.target.checked)} />
              <span>{tPlanner('createThread')}</span>
            </label>
          </div>
        </fieldset>
      </section>

      <section className="rounded-xl border border-border bg-card/50 p-4 md:p-6 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{tPlanner('step2')}</h2>
          {!showPlan ? (
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
              onClick={() => setShowPlan(true)}
              disabled={!editable}
            >
              🗓 {tPlanner('step2')}
            </button>
          ) : (
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
              onClick={() => setShowPlan(false)}
            >
              ↩ {tPlanner('back')}
            </button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(parseDatetimeLocal(scheduledAtLocal))}
          {' - '}
          {new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(parseDatetimeLocal(scheduledEndLocal))}
        </p>

        {showPlan ? (
          <div className="space-y-3">
            <label className="flex flex-col gap-1 text-sm max-w-xs">
              <span className="text-muted-foreground">{tPlanner('scheduledDate')}</span>
              <input
                type="date"
                className="rounded-md border border-input bg-background px-3 py-2"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </label>
            <p className="text-xs text-muted-foreground">{tPlanner('timelineClickHint')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {SLOTS.map((slot, i) => {
                const inRange = (pickingEnd ? [rangeStartIdx] : expandSlotIndicesForward(rangeStartIdx, rangeEndIdx)).includes(i);
                return (
                  <button
                    key={slot}
                    type="button"
                    className={`h-9 rounded border text-xs ${inRange ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted'}`}
                    onClick={() => {
                      if (!pickingEnd) {
                        setRangeStartIdx(i);
                        setRangeEndIdx(i);
                        setPickingEnd(true);
                      } else {
                        setRangeEndIdx(i);
                        setPickingEnd(false);
                      }
                    }}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
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

