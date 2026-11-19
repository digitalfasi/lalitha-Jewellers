/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  // A self-contained server in .next/standalone, for the Docker image.
  output: "standalone",
  // Don't advertise the stack.
  poweredByHeader: false,
};

export default nextConfig;
