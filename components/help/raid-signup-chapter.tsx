import { getTranslations } from 'next-intl/server';
import { HelpBulletList, HelpChapter, HelpSection } from '@/components/help/help-chapter';
import { RAID_SIGNUP_CHAPTER_ID } from '@/lib/help-content';

export async function RaidSignupChapter() {
  const t = await getTranslations('help');

  return (
    <HelpChapter id={RAID_SIGNUP_CHAPTER_ID} title={t('raidSignupTitle')} intro={t('raidSignupIntro')}>
      <HelpSection title={t('raidSignupPrereqTitle')}>
        <p>{t('raidSignupPrereqText')}</p>
      </HelpSection>

      <HelpSection title={t('raidSignupWebTitle')}>
        <p>{t('raidSignupWebText')}</p>
        <HelpBulletList
          items={[t('raidSignupWebBullet1'), t('raidSignupWebBullet2'), t('raidSignupWebBullet3')]}
        />
      </HelpSection>

      <HelpSection title={t('raidSignupWebOptionsTitle')}>
        <p>{t('raidSignupWebOptionsText')}</p>
        <HelpBulletList
          items={[
            t('raidSignupWebOptionsBullet1'),
            t('raidSignupWebOptionsBullet2'),
            t('raidSignupWebOptionsBullet3'),
            t('raidSignupWebOptionsBullet4'),
            t('raidSignupWebOptionsBullet5'),
            t('raidSignupWebOptionsBullet6'),
          ]}
        />
      </HelpSection>

      <HelpSection title={t('raidSignupDiscordTitle')}>
        <p>{t('raidSignupDiscordText')}</p>
        <HelpBulletList
          items={[t('raidSignupDiscordBullet1'), t('raidSignupDiscordBullet2'), t('raidSignupDiscordBullet3')]}
        />
      </HelpSection>

      <HelpSection title={t('raidSignupDiscordActionsTitle')}>
        <HelpBulletList
          items={[
            t('raidSignupDiscordAction1'),
            t('raidSignupDiscordAction2'),
            t('raidSignupDiscordAction3'),
            t('raidSignupDiscordAction4'),
            t('raidSignupDiscordAction5'),
          ]}
        />
      </HelpSection>

      <aside className="mt-6 rounded-lg border border-border bg-muted/30 p-4 md:p-5">
        <h3 className="text-sm font-semibold text-foreground">{t('raidSignupTipsTitle')}</h3>
        <HelpBulletList items={[t('raidSignupTip1'), t('raidSignupTip2'), t('raidSignupTip3')]} />
      </aside>
    </HelpChapter>
  );
}
