import { cn } from '@/lib/utils';

export function CharacterMainStar({
  isMain,
  titleMain,
  titleAlt,
  className,
  sizePx = 22,
}: {
  isMain: boolean;
  titleMain?: string;
  titleAlt?: string;
  className?: string;
  sizePx?: number;
}) {
  const title = isMain ? titleMain : titleAlt;
  const ariaLabel = isMain ? titleMain : titleAlt;

  return (
    <span
      title={title}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center justify-center leading-none select-none',
        isMain ? 'text-amber-400' : 'text-amber-400 grayscale opacity-70 contrast-125',
        className
      )}
      style={{ fontSize: sizePx }}
    >
      ⭐
    </span>
  );
}

