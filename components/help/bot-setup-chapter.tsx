import { getTranslations } from 'next-intl/server';
import { HelpBulletList, HelpChapter, HelpSection } from '@/components/help/help-chapter';
import { BOT_SETUP_CHAPTER_ID } from '@/lib/help-content';

export async function BotSetupChapter() {
  const t = await getTranslations('help');

  return (
    <HelpChapter id={BOT_SETUP_CHAPTER_ID} title={t('botSetupTitle')} intro={t('botSetupIntro')}>
      <HelpSection title={t('botSetupInviteTitle')}>
        <p>{t('botSetupInviteText')}</p>
        <HelpBulletList
          items={[t('botSetupInviteBullet1'), t('botSetupInviteBullet2'), t('botSetupInviteBullet3')]}
        />
      </HelpSection>

      <HelpSection title={t('botSetupSlashTitle')}>
        <p>{t('botSetupSlashText')}</p>
        <HelpBulletList
          items={[t('botSetupSlashBullet1'), t('botSetupSlashBullet2'), t('botSetupSlashBullet3')]}
        />
      </HelpSection>

      <HelpSection title={t('botSetupModesTitle')}>
        <p>{t('botSetupModesText')}</p>
        <HelpBulletList
          items={[t('botSetupModesBullet1'), t('botSetupModesBullet2'), t('botSetupModesBullet3')]}
        />
        <p>{t('botSetupModesReconfigure')}</p>
      </HelpSection>

      <HelpSection title={t('botSetupWebTitle')}>
        <p>{t('botSetupWebText')}</p>
        <HelpBulletList
          items={[
            t('botSetupWebBullet1'),
            t('botSetupWebBullet2'),
            t('botSetupWebBullet3'),
            t('botSetupWebBullet4'),
          ]}
        />
      </HelpSection>

      <HelpSection title={t('botSetupVerifyTitle')}>
        <p>{t('botSetupVerifyText')}</p>
        <HelpBulletList items={[t('botSetupVerifyBullet1'), t('botSetupVerifyBullet2')]} />
      </HelpSection>

      <aside className="mt-6 rounded-lg border border-border bg-muted/30 p-4 md:p-5">
        <h3 className="text-sm font-semibold text-foreground">{t('botSetupTipsTitle')}</h3>
        <HelpBulletList
          items={[t('botSetupTip1'), t('botSetupTip2'), t('botSetupTip3')]}
        />
      </aside>
    </HelpChapter>
  );
}
