/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // Static export for Azure Static Web Apps
  trailingSlash: true,
  images: {
    unoptimized: true, // Required for static export
  },
}

module.exports = nextConfig
