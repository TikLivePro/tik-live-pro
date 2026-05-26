'use client';

import { useTranslations } from 'next-intl';
import { TikTokIcon, FacebookIcon } from '@/features/auth/components/AuthIcons';
import { useConnectTikTok } from '@/features/settings/hooks/useConnectTikTok';
import { useConnectFacebook } from '@/features/settings/hooks/useConnectFacebook';

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

        <div className="space-y-2">
          {platforms.map(({ id, icon, onConnect }) => (
            <button
              key={id}
              onClick={onConnect}
              className="w-full flex items-center gap-4 rounded-xl border border-border p-4 text-left transition-colors hover:border-brand/60 hover:bg-muted/40 active:scale-[0.99]"
            >
              <span className="shrink-0 text-foreground">{icon}</span>
              <span className="flex-1 text-sm font-semibold text-foreground">
                {t(`platform.${id}`)}
              </span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              >
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
