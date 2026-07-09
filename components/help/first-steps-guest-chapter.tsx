import { getTranslations } from 'next-intl/server';
import { HelpScreenshot } from '@/components/help/help-screenshot';
import {
  FIRST_STEPS_GUEST_CHAPTER_ID,
  FIRST_STEPS_GUEST_SCREENSHOTS,
  HELP_SCREENSHOT_BASE,
} from '@/lib/help-content';

export async function FirstStepsGuestChapter() {
  const t = await getTranslations('help');

  return (
    <section id={FIRST_STEPS_GUEST_CHAPTER_ID} className="scroll-mt-24">
      <div className="rounded-xl border border-border bg-card p-5 md:p-6">
        <h2 className="text-xl font-semibold text-foreground">{t('firstStepsGuestTitle')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('firstStepsGuestIntro')}</p>

        <ol className="mt-6 divide-y divide-border">
          {FIRST_STEPS_GUEST_SCREENSHOTS.map((step, index) => (
            <li key={step.file} className="grid gap-4 py-6 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_220px] md:items-start">
              <div className="min-w-0 space-y-2">
                <h3 className="text-base font-medium text-foreground">
                  <span className="mr-2 text-primary">{index + 1}.</span>
                  {t(step.titleKey)}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{t(step.textKey)}</p>
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
            <h3 className="text-base font-medium text-foreground">
              <span className="mr-2 text-primary">7.</span>
              {t('step7Title')}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('step7Text')}</p>
          </li>
        </ol>

        <aside className="mt-6 rounded-lg border border-border bg-muted/30 p-4 md:p-5">
          <h3 className="text-sm font-semibold text-foreground">{t('tipsTitle')}</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>{t('tipExactSpelling')}</li>
            <li>{t('tipBnetPrivate')}</li>
            <li>{t('tipNoGuild')}</li>
            <li>{t('tipGuestEligibility')}</li>
          </ul>
        </aside>
      </div>
    </section>
  );
}
