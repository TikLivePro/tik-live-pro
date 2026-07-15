'use client';

import { useState } from 'react';
import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { AbstractIntlMessages } from 'next-intl';
import { Toaster } from 'sonner';
import { AuthSync } from '@/features/auth/components/AuthSync';
import { useTheme } from '@/features/auth/hooks/useTheme';
import { PersistentMinimizedPlayer } from '@/features/stream/components/PersistentMinimizedPlayer';

import { SidebarProvider } from '@/components/SidebarContext';

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster theme={theme} position="top-right" closeButton />;
}

export function Providers({
  locale,
  messages,
  children,
}: {
  locale: string;
  messages: AbstractIntlMessages;
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 2,
          },
        },
      }),
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC" now={new Date()}>
          <SidebarProvider>
            <AuthSync />
            <ThemedToaster />
            <PersistentMinimizedPlayer />
            {children}
          </SidebarProvider>
        </NextIntlClientProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
