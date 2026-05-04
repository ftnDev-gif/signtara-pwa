import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mengabaikan peringatan ESLint saat build di Vercel
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Mengabaikan error tipe data TypeScript saat build di Vercel
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;