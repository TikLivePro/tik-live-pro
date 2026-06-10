'use client';

import { useState, type FormEvent } from 'react';
import { useAuth } from './useAuth';

export function useLoginForm(callbackUrl?: string) {
  const { login, isLoading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    await login({ email, password }, callbackUrl);
  }

  return { email, setEmail, password, setPassword, showPassword, setShowPassword, handleSubmit, isLoading, error };
}
