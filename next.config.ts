/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tambahkan blok ini untuk memaksa Vercel mengabaikan warning
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Jika kamu punya konfigurasi lain sebelumnya, biarkan saja di sini
};

export default nextConfig;