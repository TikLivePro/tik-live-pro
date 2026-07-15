'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useProfile } from '@/features/auth/hooks/useProfile';
import { useUpdateProfile } from '../hooks/useUpdateProfile';
import { useUploadAvatar } from '../hooks/useUploadAvatar';
import { getInitials } from '@/lib/text.utils';
import { AVATAR_COLORS } from '@/lib/avatar.consts';
import { AVATAR_ACCEPT } from '../consts/settings.consts';
import { CheckCircleIcon } from '@/features/auth/components/AuthIcons';
import { cn } from '@/lib/utils';

export function ProfileSection(): React.JSX.Element {
  const t = useTranslations('settings');
  const { displayName, email, avatarUrl } = useProfile();
  const { mutate: updateProfile, isPending } = useUpdateProfile();
  const { mutate: uploadAvatar, isPending: isUploading } = useUploadAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(displayName ?? '');

  useEffect(() => {
    if (displayName) setName(displayName);
  }, [displayName]);

  const initials = getInitials(name || displayName || email || 'U');
  const avatarColor = AVATAR_COLORS[0];
  const isDirty = name.trim().length >= 2 && name.trim() !== (displayName ?? '');

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!isDirty) return;
    updateProfile({ displayName: name.trim() });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) uploadAvatar(file);
    e.target.value = '';
  }

  return (
    <section className="card-surface space-y-6 p-5 sm:p-6">
      <h3 className="text-display text-lg font-bold">{t('profile.title')}</h3>

      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        {/* Avatar with upload overlay */}
        <div className="flex shrink-0 flex-col items-center gap-2 self-center sm:self-start">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            aria-label={t('profile.changeAvatar')}
            className="group relative h-24 w-24 overflow-hidden rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={displayName ?? ''}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <span
                className={cn(
                  'flex h-full w-full items-center justify-center text-2xl font-bold text-white',
                  avatarColor,
                )}
              >
                {initials}
              </span>
            )}
            <span
              className={cn(
                'absolute inset-0 flex items-center justify-center bg-black/55 text-white transition-opacity',
                isUploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
              )}
            >
              {isUploading ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <svg
                  className="h-6 w-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              )}
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={AVATAR_ACCEPT}
            onChange={handleFileChange}
            className="hidden"
          />
          <p className="text-center text-[11px] text-muted-foreground">{t('profile.avatarHint')}</p>
        </div>

        <form onSubmit={handleSubmit} className="min-w-0 flex-1 space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="settings-display-name"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {t('profile.displayName')}
            </label>
            <input
              id="settings-display-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('profile.unnamed')}
              className={cn(
                'w-full rounded-xl border border-[var(--input-border-color)] bg-input px-3.5 py-2.5 text-sm',
                'placeholder:text-muted-foreground transition-colors',
              )}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="settings-email"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {t('profile.email')}
              </label>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-600 dark:text-green-400">
                <CheckCircleIcon className="h-3.5 w-3.5" />
                {t('profile.verified')}
              </span>
            </div>
            <input
              id="settings-email"
              type="email"
              value={email ?? ''}
              disabled
              className="w-full cursor-not-allowed rounded-xl border border-border bg-muted px-3.5 py-2.5 text-sm text-muted-foreground"
            />
          </div>

          <div className="flex items-center justify-end pt-1">
            <button
              type="submit"
              disabled={!isDirty || isPending}
              className="btn-gradient px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {isPending ? t('profile.saving') : t('profile.save')}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
