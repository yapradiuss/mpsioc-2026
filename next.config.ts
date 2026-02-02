import type { NextConfig } from "next";

const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/human-counting/:path*", destination: `${backendUrl}/api/human-counting/:path*` },
      { source: "/api/vehicle-counting/:path*", destination: `${backendUrl}/api/vehicle-counting/:path*` },
      { source: "/api/loranet/:path*", destination: `${backendUrl}/api/loranet/:path*` },
    ];
  },
  // Optimize webpack for stable file watching
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 1000, // Check for changes every second
        aggregateTimeout: 300, // Delay rebuild after first change
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.next/**',
          '**/dist/**',
          '**/build/**',
        ],
      };
    }
    return config;
  },
  // Disable automatic static optimization for faster dev
  reactStrictMode: true,
};

export default nextConfig;
