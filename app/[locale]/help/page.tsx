import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getServerSession } from 'next-auth';
import { BotSetupChapter } from '@/components/help/bot-setup-chapter';
import { FirstStepsGuestChapter } from '@/components/help/first-steps-guest-chapter';
import { HelpCategoryGroup, HelpToc } from '@/components/help/help-layout';
import { RaidSignupChapter } from '@/components/help/raid-signup-chapter';
import { GuildmasterTodoChapter, RaidleaderTodoChapter } from '@/components/help/todo-chapters';
import { authOptions } from '@/lib/auth';
import { HELP_CATEGORIES } from '@/lib/help-content';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function HelpPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations('help');
  const session = await getServerSession(authOptions);
  const backHref = session?.discordId ? `/${locale}/profile` : `/${locale}`;

  return (
    <main className="min-h-screen bg-background page-container py-8 md:py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
        <aside className="lg:sticky lg:top-20 lg:w-60 lg:shrink-0">
          <nav aria-label={t('tocTitle')} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('tocTitle')}
            </p>
            <div className="mt-3">
              <HelpToc
                categories={HELP_CATEGORIES}
                getCategoryTitle={(key) => t(key)}
                getChapterTitle={(key) => t(key)}
              />
            </div>
          </nav>
        </aside>

        <article className="min-w-0 flex-1 space-y-10">
          <header className="space-y-2 border-b border-border pb-6">
            <h1 className="text-2xl font-bold text-foreground md:text-3xl">{t('pageTitle')}</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{t('pageIntro')}</p>
          </header>

          <HelpCategoryGroup id="category-setup" title={t('categorySetup')}>
            <BotSetupChapter />
          </HelpCategoryGroup>

          <HelpCategoryGroup id="category-guest-member" title={t('categoryGuestMember')}>
            <FirstStepsGuestChapter />
            <RaidSignupChapter />
          </HelpCategoryGroup>

          <HelpCategoryGroup id="category-raidleader" title={t('categoryRaidleader')}>
            <RaidleaderTodoChapter />
          </HelpCategoryGroup>

          <HelpCategoryGroup id="category-guildmaster" title={t('categoryGuildmaster')}>
            <GuildmasterTodoChapter />
          </HelpCategoryGroup>

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
