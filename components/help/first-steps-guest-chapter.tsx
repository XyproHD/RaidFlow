import { getTranslations } from 'next-intl/server';
import { HelpBulletList, HelpChapter, HelpProse, HelpSection } from '@/components/help/help-chapter';
import { getHelpRichComponents } from '@/components/help/help-rich-text';
import { HelpScreenshot } from '@/components/help/help-screenshot';
import {
  FIRST_STEPS_CHAPTER_ID,
  FIRST_STEPS_GUEST_SCREENSHOTS,
  HELP_SCREENSHOT_BASE,
} from '@/lib/help-content';

export async function FirstStepsGuestChapter() {
  const t = await getTranslations('help');
  const rich = getHelpRichComponents();

  return (
    <HelpChapter
      id={FIRST_STEPS_CHAPTER_ID}
      title={t('firstStepsTitle')}
      intro={t.rich('firstStepsIntro', rich)}
    >
      {FIRST_STEPS_GUEST_SCREENSHOTS.map((step, index) => (
        <HelpSection
          key={step.file}
          title={`${index + 1}. ${t(step.titleKey)}`}
          screenshot={
            <HelpScreenshot
              src={`${HELP_SCREENSHOT_BASE}/${step.file}`}
              alt={t(step.titleKey)}
              zoomLabel={t('zoomScreenshot')}
            />
          }
        >
          <HelpProse>{t.rich(step.textKey, rich)}</HelpProse>
        </HelpSection>
      ))}

      <HelpSection title={`7. ${t('step7Title')}`}>
        <HelpProse>{t.rich('step7Text', rich)}</HelpProse>
      </HelpSection>

      <aside className="mt-6 rounded-lg border border-border bg-muted/30 p-4 md:p-5">
        <h4 className="text-sm font-semibold text-foreground">{t('tipsTitle')}</h4>
        <div className="mt-2">
          <HelpBulletList
            items={[
              t.rich('tipExactSpelling', rich),
              t.rich('tipBnetPrivate', rich),
              t.rich('tipNoGuild', rich),
              t.rich('tipGuestEligibility', rich),
              t.rich('tipDiscordChar', rich),
            ]}
          />
        </div>
      </aside>
    </HelpChapter>
  );
}
