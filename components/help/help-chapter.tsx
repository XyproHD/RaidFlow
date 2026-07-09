import type { ReactNode } from 'react';

type HelpChapterProps = {
  id: string;
  title: string;
  intro?: string;
  children: ReactNode;
};

export function HelpChapter({ id, title, intro, children }: HelpChapterProps) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="rounded-xl border border-border bg-card p-5 md:p-6">
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        {intro ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{intro}</p>
        ) : null}
        {children}
      </div>
    </section>
  );
}

type HelpSectionProps = {
  title: string;
  children: ReactNode;
  className?: string;
};

export function HelpSection({ title, children, className }: HelpSectionProps) {
  return (
    <div className={className ?? 'mt-6 space-y-2 border-t border-border pt-6 first:mt-6 first:border-t-0 first:pt-0'}>
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      <div className="text-sm leading-relaxed text-muted-foreground space-y-2">{children}</div>
    </div>
  );
}

export function HelpBulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
