import { cn } from '@/lib/utils';
import { LegalNav } from './LegalNav';
import { LegalFooter } from './LegalFooter';
import { LegalToc } from './LegalToc';
import { LegalCallout } from './LegalCallout';
import type { LegalSection } from '../interfaces/legal.interfaces';

interface LegalPageLayoutProps {
  title: string;
  lastUpdated: string;
  summary: string;
  summaryLabel: string;
  sections: LegalSection[];
}

/** Shared template for the Privacy Policy and Terms of Service pages. */
export function LegalPageLayout({
  title,
  lastUpdated,
  summary,
  summaryLabel,
  sections,
}: LegalPageLayoutProps): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <LegalNav />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 md:py-16">
        <div className="mb-10 max-w-[720px]">
          <h1 className="text-display text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {lastUpdated}
          </p>
          <LegalCallout variant="banner" title={summaryLabel} className="mt-6">
            {summary}
          </LegalCallout>
        </div>

        <div className="flex flex-col gap-8 md:flex-row md:gap-12">
          <LegalToc sections={sections} />

          <article className="min-w-0 max-w-[720px] flex-1 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
            {sections.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                className={cn('scroll-mt-24 pb-8', index > 0 && 'mt-2 border-t border-border/50 pt-8')}
              >
                <h2 className="mb-3 text-lg font-semibold text-foreground md:text-xl">{section.title}</h2>
                <p className="text-[15px] leading-[1.7] text-muted-foreground">{section.body}</p>
              </section>
            ))}
          </article>
        </div>
      </main>

      <LegalFooter />
    </div>
  );
}
