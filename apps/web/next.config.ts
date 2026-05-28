import path from 'path';
import type { NextConfig } from 'next';

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

export default nextConfig;
