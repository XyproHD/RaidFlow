import Image from 'next/image';
import { cn } from '@/lib/utils';

export function BattlenetLogo({
  size = 18,
  title,
  className,
}: {
  size?: number;
  title?: string;
  className?: string;
}) {
  return (
    <Image
      src="/icons/bnet.png"
      width={size}
      height={size}
      alt="Battle.net"
      title={title}
      className={cn('shrink-0 select-none', className)}
    />
  );
}

