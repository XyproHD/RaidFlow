import { getTranslations } from 'next-intl/server';
import type { OwnerDiagnosticsPayload, SecretField } from '@/lib/owner-diagnostics';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-2.5 border-b border-border text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="sm:col-span-2 font-mono text-xs break-all">{children}</div>
    </div>
  );
}

function formatSecret(s: SecretField): string {
  if (!s.present) return '— nicht gesetzt —';
  return `gesetzt · Länge ${s.length ?? '?'} · ${s.preview ?? ''}`;
}

export async function OwnerDiagnosticsView({ data }: { data: OwnerDiagnosticsPayload }) {
  const t = await getTranslations('ownerDiagnostics');
  const d = data.discord.botApiCheck;

  return (
    <div className="space-y-10 text-foreground">
      <section>
        <h2 className="text-lg font-semibold mb-2">{t('sectionOwner')}</h2>
        <div className="rounded-lg border border-border bg-card/30">
          <Row label={t('ownerConstantId')}>{data.ownerConstantDiscordId}</Row>
          <Row label={t('ownerDbConfig')}>{data.appConfigOwnerDiscordId ?? '—'}</Row>
          <Row label={t('envWebappOwner')}>{formatSecret(data.envWebappOwnerDiscordId)}</Row>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">{t('sectionRuntime')}</h2>
        <div className="rounded-lg border border-border bg-card/30">
          <Row label={t('generatedAt')}>{data.generatedAt}</Row>
          <Row label="Node">{data.runtime.nodeVersion}</Row>
          <Row label={t('platform')}>{data.runtime.platform}</Row>
          <Row label="NODE_ENV">{data.runtime.nodeEnv || '—'}</Row>
          <Row label="VERCEL_ENV">{data.runtime.vercelEnv || '—'}</Row>
          <Row label="VERCEL_URL">{data.runtime.vercelUrl || '—'}</Row>
          <Row label="VERCEL_REGION">{data.runtime.region || '—'}</Row>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">{t('sectionDatabase')}</h2>
        <div className="rounded-lg border border-border bg-card/30">
          <Row label="DATABASE_URL">{data.database.poolHostHint}</Row>
          <Row label="DIRECT_URL">{data.database.directUrlPresent ? t('present') : t('absent')}</Row>
          <Row label={t('dbPing')}>
            {data.database.pingOk
              ? `${t('ok')} (${data.database.pingMs ?? '?'} ms)`
              : `${t('failed')}: ${data.database.pingError ?? '—'}`}
          </Row>
          <Row label="rf_user">{String(data.counts.rfUser)}</Row>
          <Row label="rf_guild">{String(data.counts.rfGuild)}</Row>
          <Row label="rf_raid">{String(data.counts.rfRaid)}</Row>
          <Row label="rf_bot_diagnostic_log">{String(data.counts.rfBotDiagnosticLog)}</Row>
          {Object.keys(data.counts.errors).length > 0 && (
            <Row label={t('prismaCountErrors')}>
              <span className="text-destructive whitespace-pre-wrap">
                {Object.entries(data.counts.errors)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join('\n')}
              </span>
            </Row>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">{t('sectionNextAuth')}</h2>
        <div className="rounded-lg border border-border bg-card/30">
          <Row label="NEXTAUTH_URL">{data.nextAuth.url}</Row>
          <Row label="NEXTAUTH_SECRET">{formatSecret(data.nextAuth.secret)}</Row>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">{t('sectionDiscord')}</h2>
        <div className="rounded-lg border border-border bg-card/30">
          <Row label="DISCORD_CLIENT_ID">{formatSecret(data.discord.oauthClientId)}</Row>
          <Row label="DISCORD_CLIENT_SECRET">{formatSecret(data.discord.oauthClientSecret)}</Row>
          <Row label="DISCORD_BOT_CLIENT_ID / Fallback">{formatSecret(data.discord.botClientIdEnv)}</Row>
          <Row label="DISCORD_BOT_TOKEN">{formatSecret(data.discord.botToken)}</Row>
          <Row label={t('discordBotApi')}>
            {d.ok ? (
              <span className="text-green-600 dark:text-green-400">
                {t('discordBotOk', { user: d.botUsername ?? '?', id: d.botUserId ?? '?' })} ·{' '}
                {d.latencyMs ?? '?'} ms
              </span>
            ) : (
              <span className="text-destructive">
                {t('discordBotFail')}{' '}
                {d.httpStatus != null ? `(HTTP ${d.httpStatus}) ` : ''}
                {d.error ?? ''}
                {d.latencyMs != null ? ` · ${d.latencyMs} ms` : ''}
              </span>
            )}
          </Row>
        </div>
        <p className="text-sm text-muted-foreground mt-3">{t('oauthMemberHintBody')}</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">{t('sectionBotBridge')}</h2>
        <div className="rounded-lg border border-border bg-card/30">
          <Row label="BOT_SETUP_SECRET">{formatSecret(data.botBridge.setupSecret)}</Row>
          <Row label="WEBAPP_URL">{data.botBridge.webappUrl}</Row>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">{t('sectionSupabase')}</h2>
        <div className="rounded-lg border border-border bg-card/30">
          <Row label="NEXT_PUBLIC_SUPABASE_URL">{data.supabase.nextPublicUrl}</Row>
          <Row label="NEXT_PUBLIC_SUPABASE_ANON_KEY">{formatSecret(data.supabase.anonKey)}</Row>
          <Row label="SUPABASE_SERVICE_ROLE_KEY">{formatSecret(data.supabase.serviceRole)}</Row>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">{t('sectionAppConfig')}</h2>
        <div className="rounded-lg border border-border bg-card/30">
          <Row label={t('maintenanceMode')}>
            {data.featureFlagsFromDb.maintenanceMode ? t('yes') : t('no')}
          </Row>
          <Row label={t('whitelist')}>
            {data.featureFlagsFromDb.useWhitelist ? t('yes') : t('no')}
          </Row>
          <Row label={t('blacklist')}>
            {data.featureFlagsFromDb.useBlacklist ? t('yes') : t('no')}
          </Row>
          <Row label={t('botInviteEnabled')}>
            {data.featureFlagsFromDb.discordBotInviteEnabled ? t('yes') : t('no')}
          </Row>
        </div>
      </section>

      <p className="text-xs text-muted-foreground">{t('footerHint')}</p>
    </div>
  );
}
