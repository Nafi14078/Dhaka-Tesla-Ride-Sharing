/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_BUILD_MODE === "1" ? ".next-build" : ".next-dev",
};
module.exports = nextConfig;
