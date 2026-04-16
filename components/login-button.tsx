'use client';

import { signIn } from 'next-auth/react';

type Props = {
  text: string;
  callbackUrl: string;
};

export function LoginButton({ text, callbackUrl }: Props) {
  return (
    <button
      onClick={() => signIn('discord', { callbackUrl })}
      className="inline-flex items-center justify-center rounded-lg bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 min-h-[44px] transition-all shadow-sm hover:shadow-md w-full sm:w-auto"
    >
      {text}
    </button>
  );
}
