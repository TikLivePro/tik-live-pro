'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useLoginForm } from '../hooks/useLoginForm';
import { useRegisterForm } from '../hooks/useRegisterForm';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { cn } from '@/lib/utils';
import {
  LogInIcon,
  EyeIcon,
  EyeOffIcon,
  SunIcon,
  MoonIcon,
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

const OAUTH_ERROR_PARAMS = new Set(['oauth_failed', 'OAuthCallback', 'OAuthSignin', 'OAuthCreateAccount']);

export function LoginView() {
  const t = useTranslations('auth');
  const searchParams = useSearchParams();
  const { loginWithProvider, isLoading: authLoading } = useAuth();
  const { theme, toggle } = useTheme();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const loginForm = useLoginForm();
  const registerForm = useRegisterForm();

  const isLogin = mode === 'login';
  const { isLoading: formLoading, error: formError } = isLogin ? loginForm : registerForm;
  const loading = formLoading || authLoading;

  const urlErrorParam = searchParams.get('error');
  const urlError = urlErrorParam && OAUTH_ERROR_PARAMS.has(urlErrorParam) ? t('errors.oauthFailed') : null;

  function switchMode(next: 'login' | 'register'): void {
    setMode(next);
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative">
      <button
        onClick={toggle}
        aria-label="Toggle theme"
        className={cn(
          'absolute top-4 right-4 w-9 h-9 rounded-lg flex items-center justify-center',
          'text-muted-foreground hover:text-foreground',
          'bg-card border border-border',
          'hover:border-brand/50 transition-colors',
        )}
      >
        {theme === 'dark' ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
      </button>

      <div className="w-full max-w-sm">
        <div className="bg-card rounded-2xl p-8 shadow-2xl border border-border/50">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl overflow-hidden mb-5 shadow-lg shadow-brand/25">
              <img src="/logo.png" alt="TikLive Pro" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">TikLive Pro</h1>
            <p className="text-muted-foreground text-sm mt-1.5">
              {isLogin ? t('subtitle') : t('subtitleSignUp')}
            </p>
          </div>

          {urlError && (
            <p className="text-destructive text-sm bg-destructive/10 px-3 py-2 rounded-lg border border-destructive/20 mb-5">
              {urlError}
            </p>
          )}

          <div className="space-y-3">
            {SOCIAL_PROVIDERS.map(({ provider, icon, labelKey }) => (
              <button
                key={provider}
                type="button"
                disabled={loading}
                onClick={() => loginWithProvider(provider)}
                className={cn(
                  'w-full flex items-center justify-center gap-3',
                  'py-2.5 px-4 rounded-lg text-sm font-medium',
                  'bg-card border border-border text-foreground',
                  'hover:border-brand/40 hover:bg-muted/40 transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {icon}
                {t(labelKey as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">{t('orContinueWith')}</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {isLogin ? (
            <LoginForm form={loginForm} loading={loading} />
          ) : (
            <RegisterForm form={registerForm} loading={loading} />
          )}

          <p className="text-center text-xs text-muted-foreground mt-5">
            {isLogin ? (
              <>
                {t('noAccount')}{' '}
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="text-brand hover:underline font-medium"
                >
                  {t('signUp')}
                </button>
              </>
            ) : (
              <>
                {t('alreadyHaveAccount')}{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="text-brand hover:underline font-medium"
                >
                  {t('signIn')}
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface LoginFormProps {
  form: ReturnType<typeof useLoginForm>;
  loading: boolean;
}

function LoginForm({ form, loading }: LoginFormProps) {
  const t = useTranslations('auth');
  const { email, setEmail, password, setPassword, showPassword, setShowPassword, handleSubmit, error } = form;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <EmailField email={email} setEmail={setEmail} />
      <PasswordField
        id="password"
        label={t('password')}
        value={password}
        onChange={setPassword}
        show={showPassword}
        onToggleShow={() => setShowPassword((v) => !v)}
        autoComplete="current-password"
      />

      {error && <ErrorBanner message={error} />}

      <button
        type="submit"
        disabled={loading}
        className={cn(
          'w-full flex items-center justify-center gap-2.5',
          'py-3 px-6 rounded-lg font-semibold text-sm text-white',
          'bg-brand hover:bg-brand/90 active:scale-[0.98]',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
          'transition-all shadow-md shadow-brand/30',
        )}
      >
        <LogInIcon className="w-4 h-4 shrink-0" />
        {loading ? t('signingIn') : t('signIn')}
      </button>

      <p className="text-center text-xs text-muted-foreground leading-relaxed">
        {t('forgotPasswordContact')}
      </p>
    </form>
  );
}

// ---------------------------------------------------------------------------

interface RegisterFormProps {
  form: ReturnType<typeof useRegisterForm>;
  loading: boolean;
}

function RegisterForm({ form, loading }: RegisterFormProps) {
  const t = useTranslations('auth');
  const {
    email,
    setEmail,
    displayName,
    setDisplayName,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    showPassword,
    setShowPassword,
    handleSubmit,
    error,
  } = form;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <EmailField email={email} setEmail={setEmail} />

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor="displayName">
          {t('displayName')}
        </label>
        <input
          id="displayName"
          type="text"
          required
          minLength={2}
          maxLength={50}
          autoComplete="name"
          placeholder={t('displayNamePlaceholder')}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className={cn(
            'w-full px-4 py-2.5 rounded-lg text-sm',
            'bg-input border border-border text-foreground',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/60',
            'transition-colors',
          )}
        />
      </div>

      <PasswordField
        id="password"
        label={t('password')}
        value={password}
        onChange={setPassword}
        show={showPassword}
        onToggleShow={() => setShowPassword((v) => !v)}
        autoComplete="new-password"
      />

      <PasswordField
        id="confirmPassword"
        label={t('confirmPassword')}
        value={confirmPassword}
        onChange={setConfirmPassword}
        show={showPassword}
        onToggleShow={() => setShowPassword((v) => !v)}
        autoComplete="new-password"
      />

      {error && <ErrorBanner message={error} />}

      <button
        type="submit"
        disabled={loading}
        className={cn(
          'w-full flex items-center justify-center gap-2.5',
          'py-3 px-6 rounded-lg font-semibold text-sm text-white',
          'bg-brand hover:bg-brand/90 active:scale-[0.98]',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
          'transition-all shadow-md shadow-brand/30',
        )}
      >
        <LogInIcon className="w-4 h-4 shrink-0" />
        {loading ? t('signingUp') : t('signUp')}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components

interface EmailFieldProps {
  email: string;
  setEmail: (v: string) => void;
}

function EmailField({ email, setEmail }: EmailFieldProps) {
  const t = useTranslations('auth');
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground" htmlFor="email">
        {t('email')}
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        placeholder={t('emailPlaceholder')}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={cn(
          'w-full px-4 py-2.5 rounded-lg text-sm',
          'bg-input border border-border text-foreground',
          'placeholder:text-muted-foreground',
          'focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/60',
          'transition-colors',
        )}
      />
    </div>
  );
}

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  autoComplete?: string;
}

function PasswordField({ id, label, value, onChange, show, onToggleShow, autoComplete }: PasswordFieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          required
          minLength={8}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full px-4 py-2.5 pr-11 rounded-lg text-sm',
            'bg-input border border-border text-foreground',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/60',
            'transition-colors',
          )}
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="text-destructive text-sm bg-destructive/10 px-3 py-2 rounded-lg border border-destructive/20">
      {message}
    </p>
  );
}
