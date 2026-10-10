import type { Metadata, Viewport } from 'next'
import { cookies, headers } from 'next/headers'
import { Suspense, type CSSProperties } from 'react'
import { geist, geistMono, spaceGrotesk } from './fonts'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import { neutralColors, skeletonPulseIterations } from '@orbit/shared/theme'
import { API } from '@orbit/shared/api'
import { profileSchema } from '@orbit/shared/types/profile'
import { captureException } from '@sentry/nextjs'
import { PostHogProvider } from '@/components/posthog-provider'
import { NavigationHistoryTracker } from '@/components/navigation/navigation-history-tracker'
import { RouteContext } from '@/components/navigation/route-context'
import { normalizeThemeMode, resolveWebThemeVariables, VALID_COLOR_SCHEMES } from '@/lib/theme-dom'
import { serverRenderFetch } from '@/lib/server-fetch'
import { ThrottleScreen } from '@/components/ui/throttle-screen'
import { AUTH_COOKIE, REFRESH_COOKIE } from '@/lib/auth-api'
import { PublicSessionBootstrap } from '@/lib/public-session-bootstrap'
import { SessionCookieProvider } from '@/lib/session-cookie-provider'
import { KeyboardPlatformProvider } from '@/components/shell/keyboard-platform-provider'
import './globals.css'

const schemeNames = Array.from(VALID_COLOR_SCHEMES)
const canvasByScheme = Object.fromEntries(
  schemeNames.map((scheme) => [
    scheme,
    { dark: neutralColors.dark.bg, light: neutralColors.light.bg },
  ]),
)
const variablesByScheme = Object.fromEntries(
  schemeNames.map((scheme) => [
    scheme,
    {
      dark: resolveWebThemeVariables(scheme, 'dark'),
      light: resolveWebThemeVariables(scheme, 'light'),
    },
  ]),
)
async function loadInitialTheme(hasSessionCookie: boolean, cookieTheme: string | undefined) {
  if (hasSessionCookie) {
    try {
      const profile = await serverRenderFetch(API.profile.get, { cache: 'no-store', signal: AbortSignal.timeout(10000) }, profileSchema)
      return normalizeThemeMode(profile?.themePreference ?? cookieTheme)
    } catch (error) {
      // WHY: Public routes must still render when the profile API or session is unavailable; https://github.com/thomasluizon/orbit-tickets/issues/1311.
      captureException(error)
    }
  }
  return normalizeThemeMode(cookieTheme)
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  const title = t('title')
  const description = t('description')
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.useorbit.org'),
    description,
    manifest: '/manifest.webmanifest',
    icons: {
      icon: [
        { url: '/favicon.ico', type: 'image/x-icon' },
        { url: '/favicon-16.png', type: 'image/png', sizes: '16x16' },
        { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      ],
      apple: [{ url: '/apple-icon.png', type: 'image/png', sizes: '180x180' }],
    },
    openGraph: {
      title,
      description,
      type: 'website',
      images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og-image.png'],
    },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: neutralColors.light.bg },
    { media: '(prefers-color-scheme: dark)', color: neutralColors.dark.bg },
  ],
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
  const messages = await getMessages()
  const requestHeaders = await headers()
  const nonce = requestHeaders.get('x-nonce') ?? undefined
  const platform = requestHeaders.get('sec-ch-ua-platform') || requestHeaders.get('user-agent') || ''
  const applePlatform = /Mac|iPhone|iPad|iPod|iOS/i.test(platform)
  const cookieStore = await cookies()
  const hasSessionCookie = Boolean(cookieStore.get(AUTH_COOKIE)?.value || cookieStore.get(REFRESH_COOKIE)?.value)
  const initialTheme = await loadInitialTheme(hasSessionCookie, cookieStore.get('orbit_theme_mode')?.value)
  const initialThemeStyle = {
    ...resolveWebThemeVariables('orange', initialTheme),
    colorScheme: initialTheme,
    '--skeleton-pulse-iterations': skeletonPulseIterations,
  } as CSSProperties
  const themeBootstrapScript = `
    try {
      const themeName = ${JSON.stringify(initialTheme)}
      const root = document.documentElement

      if (themeName === 'dark') {
        root.classList.add('dark')
        root.classList.remove('light')
      } else {
        root.classList.add('light')
        root.classList.remove('dark')
      }

      const schemeNames = ${JSON.stringify(schemeNames)}
      schemeNames.forEach((s) => root.classList.remove('scheme-' + s))
      const activeScheme = 'orange'
      root.classList.add('scheme-' + activeScheme)

      root.style.setProperty('color-scheme', themeName)
      const variables = ${JSON.stringify(variablesByScheme)}
      Object.entries(variables[activeScheme][themeName]).forEach(([property, value]) => {
        root.style.setProperty(property, value)
      })

      const canvases = ${JSON.stringify(canvasByScheme)}
      document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
        meta.setAttribute('content', canvases[activeScheme][themeName])
      })
    } catch {}
  `

  return (
    <html
      lang={locale}
      className={`${initialTheme} scheme-orange ${geist.variable} ${spaceGrotesk.variable} ${geistMono.variable}`}
      style={initialThemeStyle}
      suppressHydrationWarning
    >
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: themeBootstrapScript,
          }}
        />
      </head>
      <body className="bg-[var(--bg)] text-[var(--fg-1)] font-sans antialiased">
        <PostHogProvider>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <RouteContext>
              <Suspense fallback={null}>
                <PublicSessionBootstrap hasSessionCookie={hasSessionCookie} />
                <NavigationHistoryTracker />
              </Suspense>
              <SessionCookieProvider hasSessionCookie={hasSessionCookie}>
                <KeyboardPlatformProvider applePlatform={applePlatform}>
                  {children}
                </KeyboardPlatformProvider>
              </SessionCookieProvider>
              <ThrottleScreen />
            </RouteContext>
          </NextIntlClientProvider>
        </PostHogProvider>
      </body>
    </html>
  )
}
