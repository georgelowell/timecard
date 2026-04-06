import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  // Silence firebase-admin warnings in Edge runtime
  serverExternalPackages: ['firebase-admin'],
};

export default nextConfig;
