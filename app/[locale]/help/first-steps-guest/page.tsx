import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const SCREENSHOTS = [
  { file: '01_LoginwithDiscord.png', titleKey: 'step1Title', textKey: 'step1Text' },
  { file: '02_authorize.png', titleKey: 'step2Title', textKey: 'step2Text' },
  { file: '03_1_Add_Character.png', titleKey: 'step3Title', textKey: 'step3Text' },
  { file: '04_1_SelectWoWServer.png', titleKey: 'step4Title', textKey: 'step4Text' },
  { file: '04_1_SelectCharAndSync.png', titleKey: 'step5Title', textKey: 'step5Text' },
  { file: '04_3_SlectClassandspecs.png', titleKey: 'step6Title', textKey: 'step6Text' },
] as const;

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function FirstStepsGuestHelpPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations('help');
  const session = await getServerSession(authOptions);
  const backHref = session?.discordId ? `/${locale}/profile` : `/${locale}`;

  return (
    <main className="min-h-screen bg-background page-container py-8 md:py-12 max-w-3xl">
      <header className="mb-8">
        <p className="text-sm text-muted-foreground mb-2">{t('menuTitle')}</p>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">{t('firstStepsGuestTitle')}</h1>
        <p className="mt-3 text-muted-foreground leading-relaxed">{t('firstStepsGuestIntro')}</p>
      </header>

      <ol className="space-y-10">
        {SCREENSHOTS.map((step, index) => (
          <li key={step.file} className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              <span className="text-primary mr-2">{index + 1}.</span>
              {t(step.titleKey)}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{t(step.textKey)}</p>
            <figure className="rounded-xl border border-border overflow-hidden bg-muted/30 shadow-sm">
              <Image
                src={`/help/first-steps-guest/${step.file}`}
                alt={t(step.titleKey)}
                width={1280}
                height={720}
                className="w-full h-auto"
                sizes="(max-width: 768px) 100vw, 768px"
                priority={index < 2}
              />
            </figure>
          </li>
        ))}

        <li className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            <span className="text-primary mr-2">7.</span>
            {t('step7Title')}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{t('step7Text')}</p>
        </li>
      </ol>

      <section className="mt-12 rounded-xl border border-border bg-muted/20 p-5 md:p-6 space-y-3">
        <h2 className="text-base font-semibold text-foreground">{t('tipsTitle')}</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground leading-relaxed">
          <li>{t('tipExactSpelling')}</li>
          <li>{t('tipBnetPrivate')}</li>
          <li>{t('tipNoGuild')}</li>
          <li>{t('tipGuestEligibility')}</li>
        </ul>
      </section>

      <div className="mt-8">
        <Link
          href={backHref}
          className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          ← {t('backToApp')}
        </Link>
      </div>
    </main>
  );
}
