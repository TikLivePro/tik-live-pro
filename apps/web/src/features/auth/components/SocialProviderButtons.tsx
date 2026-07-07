'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { GoogleIcon, FacebookIcon, TikTokIcon } from './AuthIcons';
import { SOCIAL_BUTTON_CLASSES } from '../consts/auth.consts';
import type { OAuthProvider } from '../interfaces/auth.interfaces';

const PROVIDERS: {
  provider: OAuthProvider;
  icon: React.ReactNode;
  labelKey: 'socialTikTok' | 'socialFacebook' | 'socialGoogle';
}[] = [
  { provider: 'tiktok', icon: <TikTokIcon className="h-5 w-5" />, labelKey: 'socialTikTok' },
  { provider: 'facebook', icon: <FacebookIcon className="h-5 w-5 fill-white" />, labelKey: 'socialFacebook' },
  { provider: 'google', icon: <GoogleIcon className="h-5 w-5" />, labelKey: 'socialGoogle' },
];

interface SocialProviderButtonsProps {
  disabled: boolean;
  onSelect: (provider: OAuthProvider) => void;
}

export function SocialProviderButtons({ disabled, onSelect }: SocialProviderButtonsProps): React.JSX.Element {
  const t = useTranslations('auth');

  return (
    <div className="space-y-3">
      {PROVIDERS.map(({ provider, icon, labelKey }) => (
        <button
          key={provider}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(provider)}
          className={cn(
            'flex w-full items-center justify-center gap-3',
            'rounded-full px-4 py-2.5 text-sm font-semibold',
            'transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            SOCIAL_BUTTON_CLASSES[provider],
          )}
        >
          {icon}
          {t(labelKey)}
        </button>
      ))}
    </div>
  );
}
