'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SettingsNav } from './SettingsNav';
import { ProfileSection } from './ProfileSection';
import { AppearanceSection } from './AppearanceSection';
import { NotificationsSection } from './NotificationsSection';
import { SubscriptionSection } from './SubscriptionSection';
import { SecuritySection } from './SecuritySection';
import { BackArrowIcon } from '@/features/auth/components/AuthIcons';
import { CreatorLayout } from '@/components/CreatorLayout';
import { useSidebar } from '@/components/SidebarContext';
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_SECTION_IDS,
  type SettingsSectionId,
} from '../consts/settings.consts';

function sectionFromHash(hash: string): SettingsSectionId {
  const id = hash.replace(/^#/, '');
  return (SETTINGS_SECTION_IDS as readonly string[]).includes(id)
    ? (id as SettingsSectionId)
    : DEFAULT_SETTINGS_SECTION;
}

const SECTION_COMPONENTS: Record<SettingsSectionId, React.ComponentType> = {
  profile: ProfileSection,
  subscription: SubscriptionSection,
  notifications: NotificationsSection,
  appearance: AppearanceSection,
  security: SecuritySection,
};

export function SettingsView(): React.JSX.Element {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { toggleCollapse, toggleOpen } = useSidebar();

  const [section, setSection] = useState<SettingsSectionId>(DEFAULT_SETTINGS_SECTION);

  // The active section is hash-driven so the Creator sidebar deep links
  // (/settings#subscription) keep working. Account management moved to its
  // own page — forward the legacy /settings#accounts deep link there.
  useEffect(() => {
    const applyHash = (): void => {
      if (window.location.hash === '#accounts') {
        router.replace('/accounts');
        return;
      }
      setSection(sectionFromHash(window.location.hash));
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectSection = useCallback((id: SettingsSectionId) => {
    setSection(id);
    // Assigning location.hash (not replaceState) fires `hashchange`, which the
    // Creator sidebar relies on for its active-item state. No section element
    // carries the hash as a DOM id, so the browser won't scroll-jump.
    window.location.hash = id;
  }, []);

  const ActiveSection = SECTION_COMPONENTS[section];

  return (
    <CreatorLayout>
      <div className="relative min-h-screen bg-background flex-1 w-full">
        {/* Ambient background */}
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="animate-orb-drift absolute -top-32 right-[-10%] h-80 w-80 rounded-full bg-brand/10 blur-3xl" />
          <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-[hsl(15_90%_55%)]/8 blur-3xl" />
        </div>

        <header className="glass-header sticky top-0 z-40 border-b border-border/70">
          <div className="flex h-14 items-center gap-3 px-4">
            <button
              type="button"
              onClick={() => {
                if (window.innerWidth >= 1024) {
                  toggleCollapse();
                } else {
                  toggleOpen();
                }
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground mr-1"
              aria-label={tCommon('toggleSidebar')}
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>
            <Link
              href="/dashboard"
              aria-label={tCommon('back')}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <BackArrowIcon className="shrink-0" />
            </Link>
            <h1 className="text-lg font-bold tracking-tight">{t('title')}</h1>
          </div>
        </header>

        <main className="animate-fade-up container relative mx-auto max-w-6xl px-4 py-6 sm:py-8">
          <div className="mb-6">
            <h2 className="text-display text-3xl font-extrabold sm:text-4xl">{t('title')}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">{t('subtitle')}</p>
          </div>

          <div className="space-y-5 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8 lg:space-y-0">
            <SettingsNav active={section} onSelect={selectSection} />
            <div className="min-w-0">
              <ActiveSection />
            </div>
          </div>
        </main>
      </div>
    </CreatorLayout>
  );
}
