import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getServerSession } from 'next-auth';
import { FirstStepsGuestChapter } from '@/components/help/first-steps-guest-chapter';
import { authOptions } from '@/lib/auth';
import { FIRST_STEPS_GUEST_CHAPTER_ID } from '@/lib/help-content';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function HelpPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations('help');
  const session = await getServerSession(authOptions);
  const backHref = session?.discordId ? `/${locale}/profile` : `/${locale}`;

  const chapters = [
    {
      id: FIRST_STEPS_GUEST_CHAPTER_ID,
      title: t('firstStepsGuestTitle'),
    },
  ];

  return (
    <main className="min-h-screen bg-background page-container py-8 md:py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
        <aside className="lg:sticky lg:top-20 lg:w-56 lg:shrink-0">
          <nav
            aria-label={t('tocTitle')}
            className="rounded-xl border border-border bg-card p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('tocTitle')}
            </p>
            <ul className="mt-3 space-y-1">
              {chapters.map((chapter) => (
                <li key={chapter.id}>
                  <a
                    href={`#${chapter.id}`}
                    className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {chapter.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <article className="min-w-0 flex-1 space-y-8">
          <header className="space-y-2 border-b border-border pb-6">
            <p className="text-sm text-muted-foreground">{t('menuTitle')}</p>
            <h1 className="text-2xl font-bold text-foreground md:text-3xl">{t('pageTitle')}</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{t('pageIntro')}</p>
          </header>

          <FirstStepsGuestChapter />

          <div>
            <Link
              href={backHref}
              className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
            >
              ← {t('backToApp')}
            </Link>
          </div>
        </article>
      </div>
    </main>
  );
}
