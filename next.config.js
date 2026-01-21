/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // Static export for Azure Static Web Apps
  trailingSlash: true,
  images: {
    unoptimized: true, // Required for static export
  },
  experimental: {
    // Optimize imports from large packages to reduce bundle size
    optimizePackageImports: [
      '@azure/msal-browser',
      '@azure/msal-react',
      '@microsoft/microsoft-graph-client',
    ],
  },
}

module.exports = nextConfig
