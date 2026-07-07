'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useRegisterForm } from '../hooks/useRegisterForm';
import { EmailField } from './EmailField';
import { PasswordField } from './PasswordField';
import { AuthErrorAlert } from './AuthErrorAlert';
import { LogInIcon, UserIcon } from './AuthIcons';

interface RegisterFormProps {
  form: ReturnType<typeof useRegisterForm>;
  loading: boolean;
}

export function RegisterForm({ form, loading }: RegisterFormProps): React.JSX.Element {
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
        <div className="relative">
          <UserIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
              'w-full rounded-xl py-2.5 pl-10 pr-4 text-sm',
              'border border-[var(--input-border-color)] bg-input text-foreground',
              'placeholder:text-muted-foreground transition-colors',
            )}
          />
        </div>
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

      {error && <AuthErrorAlert message={error} />}

      <button
        type="submit"
        disabled={loading}
        className={cn(
          'btn-gradient flex w-full items-center justify-center gap-2.5',
          'px-6 py-3 text-sm font-semibold',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <LogInIcon className="h-4 w-4 shrink-0" />
        {loading ? t('signingUp') : t('signUp')}
      </button>
    </form>
  );
}
