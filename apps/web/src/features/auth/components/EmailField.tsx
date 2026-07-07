'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { MailIcon } from './AuthIcons';

interface EmailFieldProps {
  email: string;
  setEmail: (value: string) => void;
}

export function EmailField({ email, setEmail }: EmailFieldProps): React.JSX.Element {
  const t = useTranslations('auth');

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground" htmlFor="email">
        {t('email')}
      </label>
      <div className="relative">
        <MailIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id="email"
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
    </div>
  );
}
