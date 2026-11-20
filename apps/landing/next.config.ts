import type { NextConfig } from 'next';

// The landing site never talks to the database: every request goes to the hub API.
const hub = process.env.API_SERVER_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: '/api/hub/:path*', destination: `${hub}/api/:path*` }];
  },
};
export default nextConfig;
