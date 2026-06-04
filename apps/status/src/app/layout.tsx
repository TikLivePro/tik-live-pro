import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TikLive Pro Status',
  description: 'Real-time status of all TikLive Pro services',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
