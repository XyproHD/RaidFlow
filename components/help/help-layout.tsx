import type { ReactNode } from 'react';
import type { HelpCategoryMeta } from '@/lib/help-content';

type HelpTocProps = {
  categories: HelpCategoryMeta[];
  getCategoryTitle: (key: HelpCategoryMeta['titleKey']) => string;
  getChapterTitle: (key: HelpCategoryMeta['chapters'][number]['titleKey']) => string;
};

export function HelpToc({ categories, getCategoryTitle, getChapterTitle }: HelpTocProps) {
  return (
    <div className="space-y-5">
      {categories.map((category) => (
        <div key={category.id}>
          <a
            href={`#category-${category.id}`}
            className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
          >
            {getCategoryTitle(category.titleKey)}
          </a>
          <ul className="mt-2 space-y-0.5 border-l border-border pl-3">
            {category.chapters.map((chapter) => (
              <li key={chapter.id}>
                <a
                  href={`#${chapter.id}`}
                  className="block rounded-md py-1 pr-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {getChapterTitle(chapter.titleKey)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

type HelpCategoryGroupProps = {
  id: string;
  title: string;
  children: ReactNode;
};

export function HelpCategoryGroup({ id, title, children }: HelpCategoryGroupProps) {
  return (
    <section id={id} className="scroll-mt-24 space-y-6">
      <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">{title}</h2>
      <div className="space-y-8">{children}</div>
    </section>
  );
}
