import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { getAppConfig, setWhitelistBlacklist, setAdminFeatureFlags } from '@/lib/app-config';

export const dynamic = 'force-dynamic';

/** GET: App-Config (Whitelist/Blacklist, Bot-Einladung, Wartungsmodus, Statusmeldung). */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const config = await getAppConfig();
  return NextResponse.json({
    useWhitelist: config.useWhitelist,
    useBlacklist: config.useBlacklist,
    serverWhitelist: config.serverWhitelist,
    serverBlacklist: config.serverBlacklist,
    discordBotInviteEnabled: config.discordBotInviteEnabled,
    maintenanceMode: config.maintenanceMode,
    statusMessage: config.statusMessage,
  });
}

/** PATCH: Whitelist/Blacklist und/oder Feature-Flags (Bot-Einladung, Wartungsmodus, Statusmeldung) aktualisieren. */
export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let body: {
    useWhitelist?: boolean;
    useBlacklist?: boolean;
    serverWhitelist?: string[];
    serverBlacklist?: string[];
    discordBotInviteEnabled?: boolean;
    maintenanceMode?: boolean;
    statusMessage?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const wbUpdates: Parameters<typeof setWhitelistBlacklist>[0] = {};
  if (typeof body.useWhitelist === 'boolean') wbUpdates.useWhitelist = body.useWhitelist;
  if (typeof body.useBlacklist === 'boolean') wbUpdates.useBlacklist = body.useBlacklist;
  if (Array.isArray(body.serverWhitelist)) wbUpdates.serverWhitelist = body.serverWhitelist;
  if (Array.isArray(body.serverBlacklist)) wbUpdates.serverBlacklist = body.serverBlacklist;
  const featureUpdates: Parameters<typeof setAdminFeatureFlags>[0] = {};
  if (typeof body.discordBotInviteEnabled === 'boolean') featureUpdates.discordBotInviteEnabled = body.discordBotInviteEnabled;
  if (typeof body.maintenanceMode === 'boolean') featureUpdates.maintenanceMode = body.maintenanceMode;
  if (typeof body.statusMessage === 'string') featureUpdates.statusMessage = body.statusMessage;

  let config = await getAppConfig();
  if (Object.keys(wbUpdates).length > 0) config = await setWhitelistBlacklist(wbUpdates);
  if (Object.keys(featureUpdates).length > 0) config = await setAdminFeatureFlags(featureUpdates);

  return NextResponse.json({
    useWhitelist: config.useWhitelist,
    useBlacklist: config.useBlacklist,
    serverWhitelist: config.serverWhitelist,
    serverBlacklist: config.serverBlacklist,
    discordBotInviteEnabled: config.discordBotInviteEnabled,
    maintenanceMode: config.maintenanceMode,
    statusMessage: config.statusMessage,
  });
}
