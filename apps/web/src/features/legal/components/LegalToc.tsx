'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useActiveSection } from '../hooks/useActiveSection';
import type { LegalSection } from '../interfaces/legal.interfaces';

interface LegalTocProps {
  sections: LegalSection[];
}

/** Sticky desktop sidebar + collapsible mobile dropdown table of contents. */
export function LegalToc({ sections }: LegalTocProps): React.JSX.Element {
  const t = useTranslations('legal');
  const sectionIds = sections.map((s) => s.id);
  const activeId = useActiveSection(sectionIds);

  function scrollToSection(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <>
      {/* Mobile: collapsible dropdown */}
      <div className="mb-8 md:hidden">
        <label htmlFor="legal-toc-select" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('toc.title')}
        </label>
        <select
          id="legal-toc-select"
          value={activeId}
          onChange={(e) => scrollToSection(e.target.value)}
          className="w-full rounded-xl border border-[var(--input-border-color)] bg-input px-3.5 py-2.5 text-sm text-foreground"
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.title}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop: sticky sidebar */}
      <aside className="hidden w-56 shrink-0 md:block">
        <div className="sticky top-20 space-y-0.5 border-l border-border/60 pl-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('toc.title')}
          </h4>
          {sections.map((section) => {
            const isActive = section.id === activeId;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => scrollToSection(section.id)}
                className={cn(
                  '-ml-[17px] block w-full border-l-2 py-1.5 pl-4 text-left text-sm transition-colors',
                  isActive
                    ? 'border-brand font-semibold text-brand'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {section.title}
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}
