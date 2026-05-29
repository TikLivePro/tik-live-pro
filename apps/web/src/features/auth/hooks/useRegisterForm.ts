'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from './useAuth';

export function useRegisterForm() {
  const { register, isLoading, error } = useAuth();
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setLocalError(null);
    if (password !== confirmPassword) {
      setLocalError(t('errors.passwordsDoNotMatch'));
      return;
    }
    await register({ email, password, displayName });
  }

  return {
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
    isLoading,
    error: localError ?? error,
  };
}
