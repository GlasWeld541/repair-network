import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  // Mount the Rex app (separate Vercel project) under /rex on this domain.
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/rex', destination: 'https://glasweld-rex.vercel.app/rex' },
        { source: '/rex/:path*', destination: 'https://glasweld-rex.vercel.app/rex/:path*' },
      ],
    };
  },
};

export default nextConfig;
