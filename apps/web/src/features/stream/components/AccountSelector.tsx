'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { getPlatformIdentityColor } from '@/lib/platform.consts';
import type { SocialAccount, SocialAccountId } from '@tik-live-pro/shared-types';

interface Props {
  accounts: SocialAccount[];
  selectedIds: Set<SocialAccountId>;
  onChange: (ids: Set<SocialAccountId>) => void;
  /** Renders a "+ Connect account" dashed chip when provided. */
  onConnectClick?: () => void;
}

/**
 * Destination chip row (Pro-Stream redesign) — one toggleable,
 * platform-colored chip per connected account.
 */
export function AccountSelector({ accounts, selectedIds, onChange, onConnectClick }: Props): React.ReactElement {
  const tStream = useTranslations('stream');
  const tAccounts = useTranslations('accounts');

  // 'platform' is the MediaMTX sentinel destination, never a connectable account
  const activeAccounts = accounts.filter((a) => a.isActive && a.platform !== 'platform');

  function toggle(id: SocialAccountId): void {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(next);
  }

  const connectChip = onConnectClick && (
    <button
      type="button"
      onClick={onConnectClick}
      className="chip-platform border-dashed px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-brand/50 hover:text-brand"
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      {tAccounts('connect')}
    </button>
  );

  if (activeAccounts.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {connectChip}
        <p className="text-xs text-muted-foreground">{tStream('connectAccountsHint')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {activeAccounts.map((account) => {
        const checked = selectedIds.has(account.id);
        const color = getPlatformIdentityColor(account.platform);

        return (
          <label
            key={account.id}
            className={cn(
              'chip-platform cursor-pointer select-none px-3 py-1.5 text-sm font-medium transition-all',
              checked ? 'shadow-sm' : 'opacity-60 hover:opacity-100',
            )}
            style={
              checked && color
                ? { backgroundColor: `${color}1a`, borderColor: `${color}4d` }
                : undefined
            }
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(account.id)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={cn('h-2 w-2 rounded-full', !color && 'bg-muted-foreground')}
              style={color ? { backgroundColor: color, opacity: checked ? 1 : 0.5 } : undefined}
            />
            <span className="max-w-[160px] truncate">
              {account.displayName}
              <span className="ml-1 text-muted-foreground">
                ({tAccounts(`platform.${account.platform}`)})
              </span>
            </span>
            <span aria-hidden="true" className="text-muted-foreground">
              {checked ? (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              )}
            </span>
          </label>
        );
      })}
      {connectChip}
    </div>
  );
}
