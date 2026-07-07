'use client';

import { cn } from '@/lib/utils';
import { LockIcon, EyeIcon, EyeOffIcon } from './AuthIcons';

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggleShow: () => void;
  autoComplete?: string;
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  onToggleShow,
  autoComplete,
}: PasswordFieldProps): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <LockIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={id}
          type={show ? 'text' : 'password'}
          required
          minLength={8}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full rounded-xl py-2.5 pl-10 pr-11 text-sm',
            'border border-[var(--input-border-color)] bg-input text-foreground',
            'placeholder:text-muted-foreground transition-colors',
          )}
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
