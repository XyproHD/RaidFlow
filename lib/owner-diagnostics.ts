import { prisma } from '@/lib/prisma';
import {
  DEFAULT_APP_CONFIG_STATE,
  getAppConfig,
  OWNER_DISCORD_ID,
} from '@/lib/app-config';

export type SecretField = { present: boolean; length?: number; preview?: string };

function maskSecret(raw: string | undefined | null): SecretField {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) return { present: false };
  if (v.length <= 8) return { present: true, length: v.length, preview: '(kurz)' };
  return { present: true, length: v.length, preview: `${v.slice(0, 4)}…${v.slice(-2)}` };
}

function maskClientId(raw: string | undefined | null): SecretField {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) return { present: false };
  return {
    present: true,
    length: v.length,
    preview: v.length > 10 ? `${v.slice(0, 8)}…` : '***',
  };
}

function dbHostHint(url: string | undefined | null): { configured: boolean; hint: string } {
  const u = url?.trim();
  if (!u) return { configured: false, hint: '—' };
  try {
    const normalized = u.replace(/^postgresql:\/\//i, 'postgres://');
    const parsed = new URL(normalized);
    const path = parsed.pathname.replace(/^\//, '').split(/[/?]/)[0] || '';
    return {
      configured: true,
      hint: `${parsed.hostname}:${parsed.port || '5432'} · ${path || '(kein DB-Name im Pfad)'}`,
    };
  } catch {
    return { configured: true, hint: 'URL nicht parsebar' };
  }
}

async function checkDiscordBotApi(botToken: string | undefined) {
  const t = botToken?.trim();
  if (!t) {
    return { ok: false as const, error: 'Kein Token gesetzt' };
  }
  const t0 = Date.now();
  try {
    const ctrl =
      typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
        ? AbortSignal.timeout(10000)
        : undefined;
    const res = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${t}` },
      signal: ctrl,
    });
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        ok: false as const,
        httpStatus: res.status,
        error: body.slice(0, 200) || res.statusText,
        latencyMs,
      };
    }
    const data = (await res.json()) as { id?: string; username?: string };
    return {
      ok: true as const,
      botUsername: data.username,
      botUserId: data.id,
      latencyMs,
    };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : String(e),
      latencyMs: Date.now() - t0,
    };
  }
}

export interface OwnerDiagnosticsPayload {
  generatedAt: string;
  ownerConstantDiscordId: string;
  appConfigOwnerDiscordId: string | null;
  envWebappOwnerDiscordId: SecretField;
  runtime: {
    nodeVersion: string;
    platform: string;
    nodeEnv: string;
    vercelEnv: string;
    vercelUrl: string;
    region: string;
  };
  database: {
    poolUrlConfigured: boolean;
    poolHostHint: string;
    directUrlPresent: boolean;
    pingOk: boolean;
    pingError?: string;
    pingMs?: number;
  };
  counts: {
    rfUser: number;
    rfGuild: number;
    rfRaid: number;
    rfBotDiagnosticLog: number;
  };
  nextAuth: {
    url: string;
    secret: SecretField;
  };
  discord: {
    oauthClientId: SecretField;
    oauthClientSecret: SecretField;
    botToken: SecretField;
    botClientIdEnv: SecretField;
    botApiCheck: {
      ok: boolean;
      httpStatus?: number;
      botUsername?: string;
      botUserId?: string;
      error?: string;
      latencyMs?: number;
    };
  };
  botBridge: {
    setupSecret: SecretField;
    webappUrl: string;
  };
  supabase: {
    nextPublicUrl: string;
    anonKey: SecretField;
    serviceRole: SecretField;
  };
  featureFlagsFromDb: {
    maintenanceMode: boolean;
    useWhitelist: boolean;
    useBlacklist: boolean;
    discordBotInviteEnabled: boolean;
  };
}

export async function collectOwnerDiagnostics(): Promise<OwnerDiagnosticsPayload> {
  const generatedAt = new Date().toISOString();
  let config = DEFAULT_APP_CONFIG_STATE;
  try {
    config = await getAppConfig();
  } catch {
    // Defaults bei DB-Fehler
  }

  const pool = dbHostHint(process.env.DATABASE_URL);
  const directUrlPresent = Boolean(process.env.DIRECT_URL?.trim());

  let pingOk = false;
  let pingMs: number | undefined;
  let pingError: string | undefined;
  const pingStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    pingOk = true;
    pingMs = Date.now() - pingStart;
  } catch (e) {
    pingError = e instanceof Error ? e.message : String(e);
  }

  const [rfUser, rfGuild, rfRaid, rfBotDiagnosticLog] = await Promise.all([
    prisma.rfUser.count().catch(() => -1),
    prisma.rfGuild.count().catch(() => -1),
    prisma.rfRaid.count().catch(() => -1),
    prisma.rfBotDiagnosticLog.count().catch(() => -1),
  ]);

  const botTokenRaw = process.env.DISCORD_BOT_TOKEN;
  const botApiCheck = await checkDiscordBotApi(botTokenRaw);

  return {
    generatedAt,
    ownerConstantDiscordId: OWNER_DISCORD_ID,
    appConfigOwnerDiscordId: config.ownerDiscordId,
    envWebappOwnerDiscordId: maskSecret(process.env.WEBAPP_OWNER_DISCORD_ID),
    runtime: {
      nodeVersion: process.version,
      platform: process.platform,
      nodeEnv: process.env.NODE_ENV ?? '',
      vercelEnv: process.env.VERCEL_ENV ?? '',
      vercelUrl: process.env.VERCEL_URL ?? '',
      region: process.env.VERCEL_REGION ?? '',
    },
    database: {
      poolUrlConfigured: pool.configured,
      poolHostHint: pool.hint,
      directUrlPresent,
      pingOk,
      pingError,
      pingMs,
    },
    counts: {
      rfUser,
      rfGuild,
      rfRaid,
      rfBotDiagnosticLog,
    },
    nextAuth: {
      url: (process.env.NEXTAUTH_URL ?? '').trim() || '—',
      secret: maskSecret(process.env.NEXTAUTH_SECRET),
    },
    discord: {
      oauthClientId: maskClientId(process.env.DISCORD_CLIENT_ID),
      oauthClientSecret: maskSecret(process.env.DISCORD_CLIENT_SECRET),
      botToken: maskSecret(botTokenRaw),
      botClientIdEnv: maskClientId(
        process.env.DISCORD_BOT_CLIENT_ID ?? process.env.DISCORD_CLIENT_ID
      ),
      botApiCheck: {
        ok: botApiCheck.ok,
        httpStatus: 'httpStatus' in botApiCheck ? botApiCheck.httpStatus : undefined,
        botUsername: 'botUsername' in botApiCheck ? botApiCheck.botUsername : undefined,
        botUserId: 'botUserId' in botApiCheck ? botApiCheck.botUserId : undefined,
        error: 'error' in botApiCheck ? botApiCheck.error : undefined,
        latencyMs: botApiCheck.latencyMs,
      },
    },
    botBridge: {
      setupSecret: maskSecret(process.env.BOT_SETUP_SECRET),
      webappUrl: (process.env.WEBAPP_URL ?? '').trim() || '—',
    },
    supabase: {
      nextPublicUrl: (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim() || '—',
      anonKey: maskSecret(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      serviceRole: maskSecret(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
    featureFlagsFromDb: {
      maintenanceMode: config.maintenanceMode,
      useWhitelist: config.useWhitelist,
      useBlacklist: config.useBlacklist,
      discordBotInviteEnabled: config.discordBotInviteEnabled,
    },
  };
}
