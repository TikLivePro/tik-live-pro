'use client';

import { useTranslations } from 'next-intl';
import { TikTokIcon, FacebookIcon, LockIcon } from '@/features/auth/components/AuthIcons';
import { useConnectTikTok } from '../hooks/useConnectTikTok';
import { useConnectFacebook } from '../hooks/useConnectFacebook';

const COMING_SOON_TILE_COUNT = 2;

interface ConnectAccountModalProps {
  open: boolean;
  onClose: () => void;
}

interface PlatformOption {
  id: 'tiktok' | 'facebook';
  icon: React.ReactNode;
  onConnect: () => void;
}

export function ConnectAccountModal({ open, onClose }: ConnectAccountModalProps): React.ReactElement | null {
  const t = useTranslations('accounts');
  const tc = useTranslations('common');
  const connectTikTok = useConnectTikTok();
  const connectFacebook = useConnectFacebook();

  if (!open) return null;

  const platforms: PlatformOption[] = [
    {
      id: 'tiktok',
      icon: <TikTokIcon className="h-6 w-6" />,
      onConnect: () => { connectTikTok(); onClose(); },
    },
    {
      id: 'facebook',
      icon: <FacebookIcon className="h-6 w-6" />,
      onConnect: () => { connectFacebook(); onClose(); },
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl space-y-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-foreground">{t('modal.title')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('modal.subtitle')}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={tc('close')}
            className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-muted transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {platforms.map(({ id, icon, onConnect }) => (
            <button
              key={id}
              onClick={onConnect}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border p-4 text-center transition-colors hover:border-brand/60 hover:bg-muted/40 active:scale-[0.99]"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-foreground">
                {icon}
              </span>
              <span className="text-sm font-semibold text-foreground">{t(`platform.${id}`)}</span>
            </button>
          ))}

          {Array.from({ length: COMING_SOON_TILE_COUNT }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/10 p-4 text-center opacity-40"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border">
                <LockIcon className="h-5 w-5" />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('modal.comingSoon')}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-start gap-2">
          <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" />
            <line x1="8" y1="7.5" x2="8" y2="11" />
            <circle cx="8" cy="5" r="0.5" fill="currentColor" />
          </svg>
          <p className="text-[11px] italic leading-relaxed text-muted-foreground">
            {t('modal.privacyNote')}
          </p>
        </div>
      </div>
    </div>
  );
}
