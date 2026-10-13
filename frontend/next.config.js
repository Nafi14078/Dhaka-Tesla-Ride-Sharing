/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Vercel and the production Docker image expect Next.js's standard `.next`
  // output directory. Keep development builds separate from it.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};
module.exports = nextConfig;
