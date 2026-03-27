import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export type ThemeBody = { theme: 'light' | 'dark' };

/** Theme-Preferenz des eingeloggten Users in der DB speichern (zusätzlich zum Cookie). */
export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.discordId) {
      return NextResponse.json(
        { error: 'Nicht eingeloggt' },
        { status: 401 }
      );
    }

    const body = (await request.json()) as ThemeBody;
    const theme = body?.theme;
    if (theme !== 'light' && theme !== 'dark') {
      return NextResponse.json(
        { error: 'Ungültiger theme-Wert (erlaubt: light, dark)' },
        { status: 400 }
      );
    }

    await prisma.rfUser.updateMany({
      where: { discordId: session.discordId },
      data: { themePreference: theme },
    });

    return NextResponse.json({ ok: true, theme });
  } catch (e) {
    console.error('PATCH /api/user/theme', e);
    return NextResponse.json(
      { error: 'Fehler beim Speichern des Themes' },
      { status: 500 }
    );
  }
}
