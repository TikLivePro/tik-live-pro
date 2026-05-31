'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/text.utils';
import { AVATAR_COLORS } from '../consts/stream.consts';
import type { SocialAccount, SocialAccountId, SocialPlatform } from '@tik-live-pro/shared-types';

interface Props {
  accounts: SocialAccount[];
  selectedIds: Set<SocialAccountId>;
  onChange: (ids: Set<SocialAccountId>) => void;
}

const PLATFORM_ORDER: SocialPlatform[] = ['tiktok', 'facebook'];

export function AccountSelector({ accounts, selectedIds, onChange }: Props): React.ReactElement {
  const tStream = useTranslations('stream');
  const tAccounts = useTranslations('accounts');

  const activeAccounts = accounts.filter((a) => a.isActive);

  const byPlatform = PLATFORM_ORDER.reduce<Record<SocialPlatform, SocialAccount[]>>(
    (acc, p) => ({ ...acc, [p]: activeAccounts.filter((a) => a.platform === p) }),
    { tiktok: [], facebook: [], platform: [] },
  );

  function toggle(id: SocialAccountId) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(next);
  }

  function toggleGroup(platform: SocialPlatform) {
    const group = byPlatform[platform];
    const allSelected = group.every((a) => selectedIds.has(a.id));
    const next = new Set(selectedIds);
    if (allSelected) {
      group.forEach((a) => next.delete(a.id));
    } else {
      group.forEach((a) => next.add(a.id));
    }
    onChange(next);
  }

  if (activeAccounts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-center">
        <p className="text-sm font-medium text-muted-foreground">{tStream('noAccountsConnected')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{tStream('connectAccountsHint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {PLATFORM_ORDER.map((platform) => {
        const group = byPlatform[platform];
        if (group.length === 0) return null;
        const allGroupSelected = group.every((a) => selectedIds.has(a.id));

        return (
          <div key={platform}>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {platform === 'tiktok' ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-black text-[9px] font-black text-white">
                    TT
                  </span>
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-[#1877F2] text-[10px] font-black text-white">
                    f
                  </span>
                )}
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {tAccounts(`platform.${platform}`)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => toggleGroup(platform)}
                className="text-xs text-brand hover:underline focus:outline-none"
              >
                {allGroupSelected ? tStream('deselectAll') : tStream('selectAll')}
              </button>
            </div>

            <div className="space-y-1.5">
              {group.map((account, i) => {
                const checked = selectedIds.has(account.id);
                const avatarColor = AVATAR_COLORS[i % AVATAR_COLORS.length] ?? 'bg-slate-600';

                return (
                  <label
                    key={account.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors',
                      checked
                        ? 'border-brand/50 bg-brand/5'
                        : 'border-border bg-background hover:bg-muted/50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(account.id)}
                      className="sr-only"
                    />
                    <div
                      className={cn(
                        'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white',
                        avatarColor,
                      )}
                    >
                      {getInitials(account.displayName)}
                    </div>
                    <span className="flex-1 truncate text-sm font-medium">{account.displayName}</span>
                    <span
                      className={cn(
                        'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border-2 transition-colors',
                        checked ? 'border-brand bg-brand' : 'border-border bg-background',
                      )}
                    >
                      {checked && (
                        <svg
                          className="h-2.5 w-2.5 text-white"
                          viewBox="0 0 10 10"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="1.5,5 4,7.5 8.5,2" />
                        </svg>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
