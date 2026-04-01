import { BattlenetLogo } from '@/components/battlenet-logo';
import { CharacterDiscordNameHint } from '@/components/character-discord-name-hint';
import { CharacterGearscoreBadge } from '@/components/character-gearscore-badge';
import { SpecIcon } from '@/components/spec-icon';
import { cn } from '@/lib/utils';

export function CharacterNameWithDiscordInline({
  name,
  discordName,
  className,
  discordClassName,
}: {
  name: string;
  discordName?: string | null;
  className?: string;
  discordClassName?: string;
}) {
  const dn = discordName?.trim();
  return (
    <span className={cn(className)}>
      {name}
      {dn ? <span className={cn('text-muted-foreground font-normal', discordClassName)}> · {dn}</span> : null}
    </span>
  );
}

export function CharacterDiscordPill({
  discordName,
  className,
  title,
  blink,
}: {
  discordName?: string | null;
  className?: string;
  title?: string;
  blink?: boolean;
}) {
  const dn = discordName?.trim();
  if (!dn) return null;
  return (
    <span
      className={cn(
        'rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground max-w-[9rem] truncate',
        blink && 'rf-blink-discord-conflict',
        className
      )}
      title={title ?? dn}
    >
      {dn}
    </span>
  );
}

export function CharacterGearscorePill({
  gearScore,
  className,
  title = 'Gearscore',
}: {
  gearScore?: number | null;
  className?: string;
  title?: string;
}) {
  if (typeof gearScore !== 'number') return null;
  return (
    <span
      className={cn(
        'rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground tabular-nums',
        className
      )}
      title={title}
    >
      GS {gearScore}
    </span>
  );
}

export function CharacterSpecIconsInline({
  mainSpec,
  offSpec,
  size,
  slashClassName,
  offSpecIconClassName,
  offSpecWrapperBaseClassName = 'grayscale contrast-90 inline-flex',
  offSpecWrapperClassName,
}: {
  mainSpec: string;
  offSpec?: string | null;
  size: number;
  slashClassName?: string;
  offSpecIconClassName?: string;
  offSpecWrapperBaseClassName?: string;
  offSpecWrapperClassName?: string;
}) {
  return (
    <>
      <SpecIcon spec={mainSpec} size={size} />
      {offSpec ? (
        <>
          <span className={cn('text-muted-foreground text-xs', slashClassName)}>/</span>
          <span className={cn(offSpecWrapperBaseClassName, offSpecWrapperClassName)}>
            <SpecIcon spec={offSpec} size={size} className={offSpecIconClassName} />
          </span>
        </>
      ) : null}
    </>
  );
}

export function CharacterNameBadges({
  name,
  discordName,
  hasBattlenet,
  characterId,
  gearScore,
  onGearscoreUpdated,
  containerClassName,
  wrapperClassName,
  nameClassName,
  bnetTitle,
}: {
  name: string;
  discordName?: string | null;
  hasBattlenet?: boolean;
  characterId: string;
  gearScore?: number | null;
  onGearscoreUpdated?: (nextStored: number) => void;
  containerClassName?: string;
  /** Optional override for the outer wrapper classes (useful for "contents"). */
  wrapperClassName?: string;
  nameClassName: string;
  bnetTitle: string;
}) {
  return (
    <div className={cn(wrapperClassName ?? 'flex items-center gap-1.5 min-w-0', containerClassName)}>
      <CharacterDiscordNameHint discordName={discordName} className={nameClassName}>
        {name}
      </CharacterDiscordNameHint>
      {hasBattlenet ? <BattlenetLogo size={18} title={bnetTitle} /> : null}
      <CharacterGearscoreBadge
        characterId={characterId}
        hasBattlenet={hasBattlenet}
        gearScore={gearScore}
        onUpdated={onGearscoreUpdated}
      />
    </div>
  );
}

