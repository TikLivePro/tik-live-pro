'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '../hooks/useAuth';
import { cn } from '@/lib/utils';
import { LogInIcon, EyeIcon, EyeOffIcon, MailIcon, LockIcon } from './AuthIcons';
import { SocialProviderButtons } from './SocialProviderButtons';
import { AuthErrorAlert } from './AuthErrorAlert';

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
        className="glass-overlay animate-scale-in w-full max-w-sm rounded-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{t('signIn')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <SocialProviderButtons
          disabled={isLoading}
          onSelect={(provider) => loginWithProvider(provider, callbackUrl)}
        />

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t('orContinueWith')}
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <MailIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="email"
              required
              autoComplete="email"
              placeholder={t('emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cn(
                'w-full rounded-xl py-2.5 pl-10 pr-4 text-sm',
                'border border-[var(--input-border-color)] bg-input text-foreground',
                'placeholder:text-muted-foreground transition-colors',
              )}
            />
          </div>

          <div className="relative">
            <LockIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              autoComplete="current-password"
              placeholder={t('password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={cn(
                'w-full rounded-xl py-2.5 pl-10 pr-11 text-sm',
                'border border-[var(--input-border-color)] bg-input text-foreground',
                'placeholder:text-muted-foreground transition-colors',
              )}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          </div>

          {error && <AuthErrorAlert message={error} />}

          <button
            type="submit"
            disabled={isLoading}
            className={cn(
              'btn-gradient flex w-full items-center justify-center gap-2',
              'px-4 py-2.5 text-sm font-semibold',
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
