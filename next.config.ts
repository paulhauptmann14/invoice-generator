import type { NextConfig } from 'next'
import { securityHeaders } from './src/lib/security-headers'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // react-pdf reads font files from disk at runtime; make sure they ship with the server bundle.
  outputFileTracingIncludes: {
    '/api/**': ['./node_modules/@fontsource/*/files/*-latin-{400,700}-normal.woff'],
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
