import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { ROLE_ICONS } from '@/lib/role-spec-icons';
import { formatRaidTerminLine } from '@/lib/format-raid-termin';
import { countSignedPerSpec, formatCompositionGaps } from '@/lib/raid-composition-summary';
import { SpecIcon } from '@/components/spec-icon';
import { RaidAnmeldungen, type AnmeldungRow } from '@/components/raid-detail/raid-anmeldungen';
import { RaidSignupHistoryPanel } from '@/components/raid-detail/raid-signup-history';
import { filterSignupsVisibleToViewer } from '@/lib/raid-detail-access';

export type RaidViewRaid = {
  id: string;
  name: string;
  scheduledAt: Date;
  scheduledEndAt: Date | null;
  signupUntil: Date;
  minTanks: number;
  minMelee: number;
  minRange: number;
  minHealers: number;
  minSpecs: unknown;
  maxPlayers: number;
  status: string;
  signupVisibility: string;
  note: string | null;
  _count: { signups: number };
  guild: { name: string };
  dungeon: { name: string; names: { name: string }[] };
  dungeonNames?: string[];
  raidGroupRestriction: { name: string } | null;
  signups: {
    id: string;
    userId: string;
    type: string;
    isLate: boolean;
    note: string | null;
    signedSpec: string | null;
    leaderAllowsReserve: boolean;
    leaderMarkedTeilnehmer: boolean;
    onlySignedSpec: boolean;
    forbidReserve: boolean;
    character: {
      name: string;
      mainSpec: string;
      offSpec: string | null;
      isMain: boolean;
    } | null;
  }[];
};

export async function RaidViewSection({
  raid,
  locale,
  guildId,
  raidId,
  userId,
  canEdit,
}: {
  raid: RaidViewRaid;
  locale: string;
  guildId: string;
  raidId: string;
  userId: string;
  canEdit: boolean;
}) {
  const t = await getTranslations('raidDetail');

  const dungeonName =
    raid.dungeonNames && raid.dungeonNames.length > 0
      ? raid.dungeonNames.join(' / ')
      : raid.dungeon.names[0]?.name ?? raid.dungeon.name;
  const dateShort = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(raid.scheduledAt);

  const raidTermin = formatRaidTerminLine(locale, raid.scheduledAt, raid.scheduledEndAt);

  const minSpecsObj =
    raid.minSpecs &&
    typeof raid.minSpecs === 'object' &&
    !Array.isArray(raid.minSpecs)
      ? (raid.minSpecs as Record<string, number>)
      : null;

  const compSignups = raid.signups.map((s) => ({
    type: s.type,
    signedSpec: s.signedSpec,
    character: s.character ? { mainSpec: s.character.mainSpec } : null,
  }));

  const gapsText = formatCompositionGaps({
    minTanks: raid.minTanks,
    minMelee: raid.minMelee,
    minRange: raid.minRange,
    minHealers: raid.minHealers,
    minSpecs: minSpecsObj,
    signups: compSignups,
  });

  const visibleSignups = filterSignupsVisibleToViewer(
    raid.signups,
    userId,
    raid.signupVisibility,
    canEdit,
    raid.status
  );

  const rows: AnmeldungRow[] = visibleSignups.map((s) => ({
    id: s.id,
    userId: s.userId,
    character: s.character,
    signedSpec: s.signedSpec,
    type: s.type,
    isLate: s.isLate,
    note: s.note,
    leaderAllowsReserve: s.leaderAllowsReserve,
    leaderMarkedTeilnehmer: s.leaderMarkedTeilnehmer,
    onlySignedSpec: s.onlySignedSpec,
    forbidReserve: s.forbidReserve,
  }));

  const visibilityLabel =
    raid.signupVisibility === 'raid_leader_only'
      ? t('visibilityLeaders')
      : t('visibilityPublic');

  const roleRow = [
    { key: 'Tank' as const, min: raid.minTanks, icon: ROLE_ICONS.Tank },
    { key: 'Melee' as const, min: raid.minMelee, icon: ROLE_ICONS.Melee },
    { key: 'Range' as const, min: raid.minRange, icon: ROLE_ICONS.Range },
    { key: 'Healer' as const, min: raid.minHealers, icon: ROLE_ICONS.Healer },
  ].filter((x) => x.min > 0);

  return (
    <section className="space-y-8" aria-labelledby="raid-view-heading">
      <header className="space-y-1 border-b border-border pb-5">
        <p className="text-sm text-muted-foreground">
          {dungeonName} · {raid.guild.name} · {dateShort}
        </p>
        <h2 id="raid-view-heading" className="text-2xl font-bold text-foreground tracking-tight">
          {raid.name}
        </h2>
        <p className="text-base text-foreground/90">
          <span className="text-muted-foreground">{t('raidSlotLabel')}:</span> {raidTermin}
        </p>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-border bg-card/50 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('sectionMeta')}
          </h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t('signupUntil')}</dt>
              <dd>
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: 'short',
                  timeStyle: 'short',
                }).format(raid.signupUntil)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t('maxPlayers')}</dt>
              <dd>
                {raid._count.signups} / {raid.maxPlayers}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t('status')}</dt>
              <dd className="capitalize">{raid.status}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t('visibility')}</dt>
              <dd>{visibilityLabel}</dd>
            </div>
            {raid.raidGroupRestriction && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t('restriction')}</dt>
                <dd className="text-right">{raid.raidGroupRestriction.name}</dd>
              </div>
            )}
          </dl>
        </div>

        {raid.note && (
          <div className="space-y-2 rounded-lg border border-border bg-card/50 p-4 sm:col-span-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('note')}
            </h3>
            <p className="text-sm whitespace-pre-wrap">{raid.note}</p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">{t('minRolesHeading')}</h3>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {roleRow.map(({ key, min, icon }) => (
            <span key={key} className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
              <Image src={icon.src} alt="" width={20} height={20} unoptimized />
              <span className="tabular-nums font-medium">{min}</span>
            </span>
          ))}
        </div>
      </div>

      {minSpecsObj && Object.keys(minSpecsObj).length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">{t('minSpecsOneLine')}</h3>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {Object.entries(minSpecsObj).map(([spec, need]) => {
              const have = countSignedPerSpec(compSignups, spec);
              return (
                <span
                  key={spec}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1"
                >
                  <SpecIcon spec={spec} size={20} />
                  <span className="tabular-nums">
                    {have}/{need}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-sm">
        <span className="text-muted-foreground">{t('compositionGaps')}: </span>
        <span>{gapsText}</span>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-foreground">{t('anmeldungenHeading')}</h3>
        {raid.signupVisibility === 'raid_leader_only' && !canEdit && (
          <p className="text-xs text-muted-foreground">{t('signupListHidden')}</p>
        )}
        <RaidAnmeldungen rows={rows} canEdit={canEdit} guildId={guildId} raidId={raidId} />
      </div>

      {canEdit && <RaidSignupHistoryPanel guildId={guildId} raidId={raidId} />}
    </section>
  );
}
