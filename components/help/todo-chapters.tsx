import { getTranslations } from 'next-intl/server';
import { HelpChapter, HelpProse } from '@/components/help/help-chapter';
import { GUILDMASTER_TODO_CHAPTER_ID, RAIDLEADER_TODO_CHAPTER_ID } from '@/lib/help-content';

export async function RaidleaderTodoChapter() {
  const t = await getTranslations('help');

  return (
    <HelpChapter id={RAIDLEADER_TODO_CHAPTER_ID} title={t('raidleaderTodoTitle')}>
      <HelpProse>
        <span className="italic text-muted-foreground/90">{t('todoPlaceholder')}</span>
      </HelpProse>
    </HelpChapter>
  );
}

export async function GuildmasterTodoChapter() {
  const t = await getTranslations('help');

  return (
    <HelpChapter id={GUILDMASTER_TODO_CHAPTER_ID} title={t('guildmasterTodoTitle')}>
      <HelpProse>
        <span className="italic text-muted-foreground/90">{t('todoPlaceholder')}</span>
      </HelpProse>
    </HelpChapter>
  );
}
