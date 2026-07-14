import { getTranslations } from 'next-intl/server';
import { HelpBulletList, HelpChapter, HelpProse, HelpSection } from '@/components/help/help-chapter';
import { getHelpRichComponents } from '@/components/help/help-rich-text';
import { RAID_SIGNUP_CHAPTER_ID } from '@/lib/help-content';

export async function RaidSignupChapter() {
  const t = await getTranslations('help');
  const rich = getHelpRichComponents();

  return (
    <HelpChapter
      id={RAID_SIGNUP_CHAPTER_ID}
      title={t('raidSignupTitle')}
      intro={t.rich('raidSignupIntro', rich)}
    >
      <HelpSection title={t('raidSignupPrereqTitle')}>
        <HelpProse>{t.rich('raidSignupPrereqText', rich)}</HelpProse>
      </HelpSection>

      <HelpSection title={t('raidSignupWebTitle')}>
        <HelpProse>{t.rich('raidSignupWebText', rich)}</HelpProse>
        <HelpBulletList
          items={[
            t.rich('raidSignupWebBullet1', rich),
            t.rich('raidSignupWebBullet2', rich),
            t.rich('raidSignupWebBullet3', rich),
          ]}
        />
      </HelpSection>

      <HelpSection title={t('raidSignupWebOptionsTitle')}>
        <HelpProse>{t.rich('raidSignupWebOptionsText', rich)}</HelpProse>
        <HelpBulletList
          items={[
            t.rich('raidSignupWebOptionsBullet1', rich),
            t.rich('raidSignupWebOptionsBullet2', rich),
            t.rich('raidSignupWebOptionsBullet3', rich),
            t.rich('raidSignupWebOptionsBullet4', rich),
            t.rich('raidSignupWebOptionsBullet5', rich),
            t.rich('raidSignupWebOptionsBullet6', rich),
          ]}
        />
      </HelpSection>

      <HelpSection title={t('raidSignupDiscordTitle')}>
        <HelpProse>{t.rich('raidSignupDiscordText', rich)}</HelpProse>
        <HelpBulletList
          items={[
            t.rich('raidSignupDiscordBullet1', rich),
            t.rich('raidSignupDiscordBullet2', rich),
            t.rich('raidSignupDiscordBullet3', rich),
            t.rich('raidSignupDiscordBullet4', rich),
          ]}
        />
      </HelpSection>

      <HelpSection title={t('raidSignupDiscordOptionsTitle')}>
        <HelpProse>{t.rich('raidSignupDiscordOptionsText', rich)}</HelpProse>
        <HelpBulletList
          items={[
            t.rich('raidSignupDiscordOptionsBullet1', rich),
            t.rich('raidSignupDiscordOptionsBullet2', rich),
            t.rich('raidSignupDiscordOptionsBullet3', rich),
          ]}
        />
      </HelpSection>

      <HelpSection title={t('raidSignupDiscordActionsTitle')}>
        <HelpBulletList
          items={[
            t.rich('raidSignupDiscordAction1', rich),
            t.rich('raidSignupDiscordAction2', rich),
            t.rich('raidSignupDiscordAction3', rich),
            t.rich('raidSignupDiscordAction4', rich),
            t.rich('raidSignupDiscordAction5', rich),
            t.rich('raidSignupDiscordAction6', rich),
          ]}
        />
      </HelpSection>

      <aside className="mt-6 rounded-lg border border-border bg-muted/30 p-4 md:p-5">
        <h4 className="text-sm font-semibold text-foreground">{t('raidSignupTipsTitle')}</h4>
        <div className="mt-2">
          <HelpBulletList
            items={[
              t.rich('raidSignupTip1', rich),
              t.rich('raidSignupTip2', rich),
              t.rich('raidSignupTip3', rich),
              t.rich('raidSignupTip4', rich),
            ]}
          />
        </div>
      </aside>
    </HelpChapter>
  );
}
