import type { ReactNode } from 'react';

type HelpChapterProps = {
  id: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
};

export function HelpChapter({ id, title, intro, children }: HelpChapterProps) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="rounded-xl border border-border bg-card p-5 md:p-6">
        <h3 className="text-xl font-semibold text-foreground">{title}</h3>
        {intro ? (
          <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{intro}</div>
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
  screenshot?: ReactNode;
};

export function HelpSection({ title, children, className, screenshot }: HelpSectionProps) {
  return (
    <div
      className={
        className ??
        'mt-6 space-y-2 border-t border-border pt-6 [&:first-child]:mt-6 [&:first-child]:border-t-0 [&:first-child]:pt-0'
      }
    >
      <h4 className="text-base font-medium text-foreground">{title}</h4>
      {screenshot ? (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-start">
          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
          <div className="md:justify-self-end">{screenshot}</div>
        </div>
      ) : (
        <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
      )}
    </div>
  );
}

export function HelpBulletList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

export function HelpProse({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>;
}
