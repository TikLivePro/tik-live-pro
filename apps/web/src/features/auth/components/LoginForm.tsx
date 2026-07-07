'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useLoginForm } from '../hooks/useLoginForm';
import { EmailField } from './EmailField';
import { PasswordField } from './PasswordField';
import { AuthErrorAlert } from './AuthErrorAlert';
import { LogInIcon } from './AuthIcons';

interface LoginFormProps {
  form: ReturnType<typeof useLoginForm>;
  loading: boolean;
}

export function LoginForm({ form, loading }: LoginFormProps): React.JSX.Element {
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
        {loading ? t('signingIn') : t('signIn')}
      </button>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        {t('forgotPasswordContact')}
      </p>
    </form>
  );
}
