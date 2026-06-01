import path from 'path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  // Traces files from the monorepo root so the standalone bundle includes shared packages
  outputFileTracingRoot: path.join(__dirname, '../../'),
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'p16-sign-sg.tiktokcdn.com' },
      { protocol: 'https', hostname: 'graph.facebook.com' },
    ],
  },
};

export default withNextIntl(nextConfig);
