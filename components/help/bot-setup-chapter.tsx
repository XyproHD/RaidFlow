import { getTranslations } from 'next-intl/server';
import { HelpBulletList, HelpChapter, HelpProse, HelpSection } from '@/components/help/help-chapter';
import { getHelpRichComponents } from '@/components/help/help-rich-text';
import { BOT_SETUP_CHAPTER_ID } from '@/lib/help-content';

export async function BotSetupChapter() {
  const t = await getTranslations('help');
  const rich = getHelpRichComponents();

  return (
    <HelpChapter
      id={BOT_SETUP_CHAPTER_ID}
      title={t('botSetupTitle')}
      intro={t.rich('botSetupIntro', rich)}
    >
      <HelpSection title={t('botSetupInviteTitle')}>
        <HelpProse>{t.rich('botSetupInviteText', rich)}</HelpProse>
        <HelpBulletList
          items={[
            t.rich('botSetupInviteBullet1', rich),
            t.rich('botSetupInviteBullet2', rich),
            t.rich('botSetupInviteBullet3', rich),
          ]}
        />
      </HelpSection>

      <HelpSection title={t('botSetupSlashTitle')}>
        <HelpProse>{t.rich('botSetupSlashText', rich)}</HelpProse>
        <HelpBulletList
          items={[
            t.rich('botSetupSlashBullet1', rich),
            t.rich('botSetupSlashBullet2', rich),
            t.rich('botSetupSlashBullet3', rich),
          ]}
        />
      </HelpSection>

      <HelpSection title={t('botSetupModesTitle')}>
        <HelpProse>{t.rich('botSetupModesText', rich)}</HelpProse>
        <HelpBulletList
          items={[
            t.rich('botSetupModesBullet1', rich),
            t.rich('botSetupModesBullet2', rich),
            t.rich('botSetupModesBullet3', rich),
          ]}
        />
        <HelpProse>{t.rich('botSetupModesReconfigure', rich)}</HelpProse>
      </HelpSection>

      <HelpSection title={t('botSetupWebTitle')}>
        <HelpProse>{t.rich('botSetupWebText', rich)}</HelpProse>
        <HelpBulletList
          items={[
            t.rich('botSetupWebBullet1', rich),
            t.rich('botSetupWebBullet2', rich),
            t.rich('botSetupWebBullet3', rich),
            t.rich('botSetupWebBullet4', rich),
          ]}
        />
      </HelpSection>

      <HelpSection title={t('botSetupVerifyTitle')}>
        <HelpProse>{t.rich('botSetupVerifyText', rich)}</HelpProse>
        <HelpBulletList
          items={[t.rich('botSetupVerifyBullet1', rich), t.rich('botSetupVerifyBullet2', rich)]}
        />
      </HelpSection>

      <aside className="mt-6 rounded-lg border border-border bg-muted/30 p-4 md:p-5">
        <h4 className="text-sm font-semibold text-foreground">{t('botSetupTipsTitle')}</h4>
        <div className="mt-2">
          <HelpBulletList
            items={[t.rich('botSetupTip1', rich), t.rich('botSetupTip2', rich), t.rich('botSetupTip3', rich)]}
          />
        </div>
      </aside>
    </HelpChapter>
  );
}
