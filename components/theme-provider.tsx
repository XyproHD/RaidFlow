'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

/** Stellt Light/Dark-Modus bereit; speichert Auswahl im Cookie (next-themes). */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="raidflow-theme"
    >
      {children}
    </NextThemesProvider>
  );
}
