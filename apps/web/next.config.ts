import type { NextConfig } from 'next';

const apiServer = process.env.API_SERVER_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${apiServer}/api/:path*`,
      },
    ];
  },
};
export default nextConfig;
