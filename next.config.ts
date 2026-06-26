import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable React strict mode
  reactStrictMode: true,

  // Configure webpack to handle Stream Video dependencies
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      // Add any necessary polyfills here
    };
    return config;
  },

  // Environment variables that should be available on the client side
  env: {
    NEXT_PUBLIC_STREAM_VIDEO_API_KEY: process.env.NEXT_PUBLIC_STREAM_VIDEO_API_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },

  // Enable CORS for API routes
  // Enable CORS for API routes - relying on Next.js default handling and Better Auth
  // explicit headers removed to avoid conflicts

  eslint: {
    ignoreDuringBuilds: true,
  },

};

export default nextConfig;
