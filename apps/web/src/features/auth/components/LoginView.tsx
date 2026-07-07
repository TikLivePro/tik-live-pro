'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useLoginForm } from '../hooks/useLoginForm';
import { useRegisterForm } from '../hooks/useRegisterForm';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { AUTH_LEGAL_LINKS } from '../consts/auth.consts';
import { cn } from '@/lib/utils';
import { SunIcon, MoonIcon } from './AuthIcons';
import { SocialProviderButtons } from './SocialProviderButtons';
import { AuthErrorAlert } from './AuthErrorAlert';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { AuthBrandPanel } from './AuthBrandPanel';

const OAUTH_ERROR_PARAMS = new Set(['oauth_failed', 'OAuthCallback', 'OAuthSignin', 'OAuthCreateAccount']);

export function LoginView(): React.JSX.Element {
  const t = useTranslations('auth');
  const tFooter = useTranslations('landing.footer');
  const searchParams = useSearchParams();
  const { loginWithProvider, isLoading: authLoading } = useAuth();
  const { theme, toggle } = useTheme();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const callbackUrl = searchParams.get('callbackUrl') ?? undefined;

  const loginForm = useLoginForm(callbackUrl);
  const registerForm = useRegisterForm(callbackUrl);

  const isLogin = mode === 'login';
  const { isLoading: formLoading } = isLogin ? loginForm : registerForm;
  const loading = formLoading || authLoading;

  const urlErrorParam = searchParams.get('error');
  const urlError = urlErrorParam && OAUTH_ERROR_PARAMS.has(urlErrorParam) ? t('errors.oauthFailed') : null;

  function switchMode(next: 'login' | 'register'): void {
    setMode(next);
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Form panel — 45% on desktop, full width below lg */}
      <div className="relative flex min-h-screen w-full flex-col lg:w-[45%]">
        <button
          onClick={toggle}
          aria-label="Toggle theme"
          className={cn(
            'absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full',
            'text-muted-foreground hover:text-foreground',
            'border border-border bg-card',
            'transition-colors hover:border-brand/50',
          )}
        >
          {theme === 'dark' ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
        </button>

        <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
          <div className="animate-fade-up w-full max-w-sm">
            <p className="bg-gradient-brand mb-8 bg-clip-text text-center text-2xl font-extrabold tracking-tight text-transparent lg:hidden">
              TikLivePro
            </p>

            <h1 className="text-display text-3xl font-bold text-foreground sm:text-4xl">
              {isLogin ? t('welcomeBack') : t('subtitleSignUp')}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground sm:text-[15px]">
              {isLogin ? t('welcomeSubtitle') : t('signUpSubtitle')}
            </p>

            {urlError && (
              <div className="mt-6">
                <AuthErrorAlert message={urlError} />
              </div>
            )}

            <div className="mt-8">
              <SocialProviderButtons
                disabled={loading}
                onSelect={(provider) => loginWithProvider(provider, callbackUrl)}
              />
            </div>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {t('orContinueWith')}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {isLogin ? (
              <LoginForm form={loginForm} loading={loading} />
            ) : (
              <RegisterForm form={registerForm} loading={loading} />
            )}

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {isLogin ? (
                <>
                  {t('noAccount')}{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('register')}
                    className="font-medium text-brand hover:underline"
                  >
                    {t('signUpToStream')}
                  </button>
                </>
              ) : (
                <>
                  {t('alreadyHaveAccount')}{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="font-medium text-brand hover:underline"
                  >
                    {t('signIn')}
                  </button>
                </>
              )}
            </p>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-4 px-6 pb-6 text-xs text-muted-foreground sm:px-10">
          <span>{tFooter('rights')}</span>
          <span className="flex gap-4">
            {AUTH_LEGAL_LINKS.map(({ href, labelKey }) => (
              <Link key={href} href={href} className="transition-colors hover:text-foreground">
                {tFooter(labelKey)}
              </Link>
            ))}
          </span>
        </footer>
      </div>

      {/* Brand visual panel — 55%, desktop only */}
      <AuthBrandPanel />
    </div>
  );
}
