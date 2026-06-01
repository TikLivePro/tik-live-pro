import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import Script from 'next/script';
import { defaultLocale, isSupported, type SupportedLocale } from '@tik-live-pro/i18n';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'TikLivePro — Multi-Platform Live Streaming',
  description: 'Stream simultaneously to TikTok, Facebook and more from one dashboard.',
  icons: { icon: '/logo.png', apple: '/logo.png' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('locale')?.value;
  const locale: SupportedLocale =
    localeCookie && isSupported(localeCookie) ? localeCookie : defaultLocale;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages = (await import(`@tik-live-pro/i18n/locales/${locale}.json`)).default as any;

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.classList.toggle('dark',t==='dark')}catch(e){}})()`,
          }}
        />
        <Providers locale={locale} messages={messages}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
