'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth';
import { useSidebar } from '@/components/SidebarContext';
import { useStream } from '../hooks/useStream';

interface NavItemMeta {
  key: 'overview' | 'streaming' | 'analytics' | 'accounts' | 'settings';
  icon: React.ReactNode;
}

const NAV_ICON_PROPS = {
  className: 'h-[18px] w-[18px] shrink-0',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

const NAV_ITEMS_META: NavItemMeta[] = [
  {
    key: 'overview',
    icon: (
      <svg {...NAV_ICON_PROPS}>
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    key: 'streaming',
    icon: (
      <svg {...NAV_ICON_PROPS}>
        <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
      </svg>
    ),
  },
  {
    key: 'analytics',
    icon: (
      <svg {...NAV_ICON_PROPS}>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    key: 'accounts',
    icon: (
      <svg {...NAV_ICON_PROPS}>
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    key: 'settings',
    icon: (
      <svg {...NAV_ICON_PROPS}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  },
];

interface Props {
  className?: string;
}

export function CreatorSidebar({ className }: Props): React.ReactElement {
  const t = useTranslations('stream.controlRoom.sidebar');
  const pathname = usePathname();
  const { currentSession } = useStream();
  const { logout } = useAuth();
  const { isCollapsed } = useSidebar();

  const [hash, setHash] = useState('');

  useEffect(() => {
    setHash(window.location.hash);
    const handleHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navItems = NAV_ITEMS_META.map((item) => {
    let href = '';
    let active = false;

    if (item.key === 'overview') {
      href = '/dashboard';
      active = pathname === '/dashboard';
    } else if (item.key === 'streaming') {
      href = currentSession?.id ? `/live/${currentSession.id}` : '/dashboard';
      active = pathname.startsWith('/live');
    } else if (item.key === 'analytics') {
      href = ''; // soon
      active = false;
    } else if (item.key === 'accounts') {
      href = '/settings#accounts';
      active = pathname === '/settings' && hash === '#accounts';
    } else if (item.key === 'settings') {
      href = '/settings';
      active = pathname === '/settings' && hash !== '#accounts';
    }

    return { ...item, href, active };
  });

  const itemBase =
    'mx-2 flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200';

  return (
    <nav
      aria-label={t('label')}
      className={cn(
        'flex w-60 shrink-0 flex-col border-r border-[var(--card-border-color)] bg-surface-1 py-5 transition-all duration-300',
        isCollapsed && 'lg:w-[72px]',
        className,
      )}
    >
      {/* Brand header */}
      <div className={cn('mb-6 flex flex-col gap-0.5 px-6', isCollapsed && 'lg:px-0 lg:items-center')}>
        <Link href="/dashboard" className="flex items-center gap-2">
          <img src="/logo.png" alt="TikLivePro" className="h-7 w-7 object-contain" />
          {!isCollapsed && (
            <span className="text-gradient-brand text-base font-bold tracking-tight">TikLivePro</span>
          )}
        </Link>
        {!isCollapsed && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {t('creatorStudio')}
          </span>
        )}
      </div>

      {/* Main navigation */}
      <div className="flex flex-1 flex-col gap-1">
        {navItems.map((item) =>
          item.active ? (
            <span
              key={item.key}
              aria-current="page"
              title={isCollapsed ? t(item.key) : undefined}
              className={cn(
                itemBase,
                'relative bg-surface-2 text-foreground shadow-sm',
                isCollapsed && 'lg:mx-1.5 lg:px-0 lg:justify-center',
              )}
            >
              <span className="bg-gradient-brand absolute inset-y-2 left-0 w-0.5 rounded-full" />
              <span className="text-brand">{item.icon}</span>
              <span className={cn(isCollapsed && 'lg:hidden')}>{t(item.key)}</span>
            </span>
          ) : item.href ? (
            <Link
              key={item.key}
              href={item.href}
              title={isCollapsed ? t(item.key) : undefined}
              className={cn(
                itemBase,
                'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                isCollapsed && 'lg:mx-1.5 lg:px-0 lg:justify-center',
              )}
            >
              {item.icon}
              <span className={cn(isCollapsed && 'lg:hidden')}>{t(item.key)}</span>
            </Link>
          ) : (
            <span
              key={item.key}
              aria-disabled="true"
              title={isCollapsed ? `${t(item.key)} (${t('soon')})` : undefined}
              className={cn(
                itemBase,
                'cursor-default text-muted-foreground/50',
                isCollapsed && 'lg:mx-1.5 lg:px-0 lg:justify-center',
              )}
            >
              {item.icon}
              <span className={cn(isCollapsed && 'lg:hidden')}>{t(item.key)}</span>
              {!isCollapsed && (
                <span className="ml-auto rounded-full border border-[var(--card-border-color)] bg-surface-2 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('soon')}
                </span>
              )}
            </span>
          ),
        )}
      </div>

      {/* Footer: upgrade CTA + help + logout */}
      <div className={cn('mt-auto flex flex-col gap-1 px-4', isCollapsed && 'lg:px-1.5')}>
        <Link
          href="/settings#subscription"
          title={isCollapsed ? t('upgradePro') : undefined}
          className={cn(
            'btn-gradient w-full py-2.5 text-center text-sm font-semibold block transition-all',
            isCollapsed && 'lg:w-10 lg:h-10 lg:p-0 lg:rounded-full lg:flex lg:items-center lg:justify-center lg:mx-auto',
          )}
        >
          {isCollapsed ? (
            <svg className="h-4.5 w-4.5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          ) : (
            t('upgradePro')
          )}
        </Link>
        <div className="my-3 h-px w-full bg-[var(--card-border-color)]" />
        <a
          href="mailto:support@tiklivepro.me"
          title={isCollapsed ? t('help') : undefined}
          className={cn(
            'flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground',
            isCollapsed && 'lg:justify-center lg:px-0',
          )}
        >
          <svg {...NAV_ICON_PROPS} className="h-4 w-4 shrink-0">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className={cn(isCollapsed && 'lg:hidden')}>{t('help')}</span>
        </a>
        <button
          type="button"
          onClick={() => void logout()}
          title={isCollapsed ? t('logout') : undefined}
          className={cn(
            'flex items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:text-foreground w-full',
            isCollapsed && 'lg:justify-center lg:px-0',
          )}
        >
          <svg {...NAV_ICON_PROPS} className="h-4 w-4 shrink-0">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span className={cn(isCollapsed && 'lg:hidden')}>{t('logout')}</span>
        </button>
      </div>
    </nav>
  );
}
