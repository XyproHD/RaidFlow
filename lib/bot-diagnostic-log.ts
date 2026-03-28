/**
 * Strukturierte Logs für Bot-Diagnose (Vercel/Railway) + optional DB-Zeile.
 * Suche in Logs nach: RF_BOT_CHECK
 */

import { prisma } from '@/lib/prisma';

const LOG_SCOPE = 'RF_BOT_CHECK';

export type BotDiagnosticKind = 'guild_member_check';

export function logBotDiagnosticConsole(
  step: string,
  data: Record<string, unknown> & { discordGuildId?: string; discordUserId?: string }
): void {
  const line = {
    level: 'info',
    scope: LOG_SCOPE,
    ts: new Date().toISOString(),
    step,
    ...data,
  };
  console.log(JSON.stringify(line));
}

export async function persistBotDiagnosticLog(params: {
  kind: BotDiagnosticKind;
  discordGuildId?: string | null;
  discordUserId?: string | null;
  success: boolean;
  summaryLine: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.rfBotDiagnosticLog.create({
      data: {
        kind: params.kind,
        discordGuildId: params.discordGuildId ?? undefined,
        discordUserId: params.discordUserId ?? undefined,
        success: params.success,
        summaryLine: params.summaryLine.slice(0, 500),
        payload: params.payload as object,
      },
    });
  } catch (e) {
    console.error('[persistBotDiagnosticLog]', e);
  }
}
