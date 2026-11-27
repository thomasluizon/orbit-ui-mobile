import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import { withSentryConfig } from '@sentry/nextjs/config'
import path from 'node:path'
import { LEGACY_PROFILE_ROUTES } from '../../packages/shared/src/utils/profile-routes'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

export function getLegacyRedirects() {
  return [
    { source: '/streak', destination: '/progress/streak', permanent: true },
    { source: '/achievements', destination: '/progress/achievements', permanent: true },
    { source: '/goals', destination: '/progress/goals', permanent: true },
    ...LEGACY_PROFILE_ROUTES.map(({ source, destination }) => ({ source, destination, permanent: true })),
  ]
}

const nextConfig: NextConfig = {
  output: 'standalone',
  deploymentId: process.env.NEXT_PUBLIC_WEB_COMMIT_SHA || undefined,
  outputFileTracingRoot: path.resolve(import.meta.dirname, '../..'),
  productionBrowserSourceMaps: false,
  skipTrailingSlashRedirect: true,
  transpilePackages: ['@orbit/shared'],
  redirects: getLegacyRedirects,
  async headers() {
    return [
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
      {
        source: '/login',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ]
  },
  env: {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BCotrosa_VZSere_khAKbxMVRj-NZIuHs4lK4sep1Fv5N6fx8z-99q9-pDPeEs0GwKiwOwf44SiI4NN5XX-htow',
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}

const intlConfig = withNextIntl(nextConfig)

// WHY: The Docker release build has no CI variable, so the plugin hid its source map upload result. A build with the token shows it.
export function isSentryBuildSilent(env: Record<string, string | undefined>) {
  return !env.CI && !env.SENTRY_AUTH_TOKEN
}

export default process.env.NODE_ENV === 'development'
  ? intlConfig
  : withSentryConfig(intlConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: isSentryBuildSilent(process.env),
      widenClientFileUpload: true,
      release: { name: process.env.NEXT_PUBLIC_WEB_COMMIT_SHA || undefined },
    })
