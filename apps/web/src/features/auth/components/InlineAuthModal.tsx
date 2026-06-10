'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '../hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  LogInIcon,
  EyeIcon,
  EyeOffIcon,
  GoogleIcon,
  FacebookIcon,
  TikTokIcon,
} from './AuthIcons';
import type { OAuthProvider } from '../interfaces/auth.interfaces';

const SOCIAL_PROVIDERS: { provider: OAuthProvider; icon: React.ReactNode; labelKey: string }[] = [
  { provider: 'google', icon: <GoogleIcon className="w-5 h-5" />, labelKey: 'socialGoogle' },
  { provider: 'facebook', icon: <FacebookIcon className="w-5 h-5" />, labelKey: 'socialFacebook' },
  { provider: 'tiktok', icon: <TikTokIcon className="w-5 h-5" />, labelKey: 'socialTikTok' },
];

interface Props {
  onClose: () => void;
  callbackUrl?: string;
}

export function InlineAuthModal({ onClose, callbackUrl }: Props): React.ReactElement {
  const t = useTranslations('auth');
  const { loginWithProvider, login, isLoading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    await login({ email, password }, undefined, onClose);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#111]/95 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">{t('signIn')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-white/40 transition-colors hover:text-white/70"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-2">
          {SOCIAL_PROVIDERS.map(({ provider, icon, labelKey }) => (
            <button
              key={provider}
              type="button"
              disabled={isLoading}
              onClick={() => loginWithProvider(provider, callbackUrl)}
              className={cn(
                'flex w-full items-center justify-center gap-3',
                'rounded-lg border border-white/15 bg-white/5 px-4 py-2.5',
                'text-sm font-medium text-white',
                'transition-colors hover:border-brand/40 hover:bg-white/10',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {icon}
              {t(labelKey as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/15" />
          <span className="text-xs text-white/40">{t('orContinueWith')}</span>
          <div className="h-px flex-1 bg-white/15" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder={t('emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={cn(
              'w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2.5',
              'text-sm text-white placeholder:text-white/30',
              'focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/40',
            )}
          />

          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              autoComplete="current-password"
              placeholder={t('password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={cn(
                'w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 pr-11',
                'text-sm text-white placeholder:text-white/30',
                'focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/40',
              )}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition-colors hover:text-white/70"
            >
              {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className={cn(
              'flex w-full items-center justify-center gap-2',
              'rounded-lg bg-brand px-4 py-2.5',
              'text-sm font-semibold text-white',
              'transition-colors hover:bg-brand/90',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <LogInIcon className="h-4 w-4 shrink-0" />
            {isLoading ? t('signingIn') : t('signIn')}
          </button>
        </form>
      </div>
    </div>
  );
}
