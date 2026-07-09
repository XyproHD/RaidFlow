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
      <ol className="mt-6 divide-y divide-border">
        {FIRST_STEPS_GUEST_SCREENSHOTS.map((step, index) => (
          <li
            key={step.file}
            className="grid gap-4 py-6 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_220px] md:items-start"
          >
            <div className="min-w-0 space-y-2">
              <h4 className="text-base font-medium text-foreground">
                <span className="mr-2 text-primary">{index + 1}.</span>
                {t(step.titleKey)}
              </h4>
              <HelpProse>{t.rich(step.textKey, rich)}</HelpProse>
            </div>
            <div className="md:justify-self-end">
              <HelpScreenshot
                src={`${HELP_SCREENSHOT_BASE}/${step.file}`}
                alt={t(step.titleKey)}
                zoomLabel={t('zoomScreenshot')}
              />
            </div>
          </li>
        ))}

        <li className="py-6">
          <h4 className="text-base font-medium text-foreground">
            <span className="mr-2 text-primary">7.</span>
            {t('step7Title')}
          </h4>
          <div className="mt-2">
            <HelpProse>{t.rich('step7Text', rich)}</HelpProse>
          </div>
        </li>
      </ol>

      <aside className="mt-6 rounded-lg border border-border bg-muted/30 p-4 md:p-5">
        <h4 className="text-sm font-semibold text-foreground">{t('tipsTitle')}</h4>
        <div className="mt-2">
          <HelpBulletList
            items={[
              t.rich('tipExactSpelling', rich),
              t.rich('tipBnetPrivate', rich),
              t.rich('tipNoGuild', rich),
              t.rich('tipGuestEligibility', rich),
            ]}
          />
        </div>
      </aside>
    </HelpChapter>
  );
}
