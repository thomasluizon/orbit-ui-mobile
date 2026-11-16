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
import { PwaLaunchHandler } from '@/components/pwa-launch-handler'
import { PostHogProvider } from '@/components/posthog-provider'
import { NavigationHistoryTracker } from '@/components/navigation/navigation-history-tracker'
import { RouteContext } from '@/components/navigation/route-context'
import { resolveInitialTheme, resolveWebThemeVariables } from '@/lib/theme-dom'
import { buildThemeBootstrapScript } from '@/lib/theme-bootstrap'
import { serverRenderFetch } from '@/lib/server-fetch'
import { ThrottleScreen } from '@/components/ui/throttle-screen'
import { DesktopWindowBar } from '@/components/desktop-window-bar'
import { AUTH_COOKIE, REFRESH_COOKIE } from '@/lib/auth-api'
import { PublicSessionBootstrap } from '@/lib/public-session-bootstrap'
import { SessionCookieProvider } from '@/lib/session-cookie-provider'
import { KeyboardPlatformProvider } from '@/components/shell/keyboard-platform-provider'
import { AccountClock } from '@/lib/account-clock'
import { NotificationsPreload } from '@/lib/notifications-preload'
import { loadInitialNotifications } from '@/lib/server-notifications'
import './globals.css'

async function loadInitialAccount(hasSessionCookie: boolean, cookieTheme: string | undefined) {
  if (hasSessionCookie) {
    try {
      const profile = await serverRenderFetch(API.profile.get, { cache: 'no-store', signal: AbortSignal.timeout(10000) }, profileSchema)
      return { theme: resolveInitialTheme(cookieTheme, profile?.themePreference), timeZone: profile?.timeZone ?? null, now: Date.now() }
    } catch (error) {
      // WHY: Public routes must still render when the profile API or session is unavailable; https://github.com/thomasluizon/orbit-tickets/issues/1311.
      captureException(error)
    }
  }
  return { theme: resolveInitialTheme(cookieTheme), timeZone: null, now: Date.now() }
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  const title = t('title')
  const description = t('description')
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.useorbit.org'),
    description,
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
  interactiveWidget: 'resizes-content',
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
  const [initialAccount, initialNotifications] = await Promise.all([
    loadInitialAccount(hasSessionCookie, cookieStore.get('orbit_theme_mode')?.value),
    loadInitialNotifications(hasSessionCookie),
  ])
  const initialTheme = initialAccount.theme ?? 'dark'
  const initialNow = initialAccount.now
  const initialThemeStyle = {
    ...resolveWebThemeVariables('orange', initialTheme),
    colorScheme: initialTheme,
    '--skeleton-pulse-iterations': skeletonPulseIterations,
  } as CSSProperties
  const themeBootstrapScript = buildThemeBootstrapScript(initialAccount.theme)

  return (
    <html
      lang={locale}
      className={`${initialTheme} scheme-orange ${geist.variable} ${spaceGrotesk.variable} ${geistMono.variable}`}
      style={initialThemeStyle}
      suppressHydrationWarning
    >
      <head>
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
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
              <PwaLaunchHandler />
              <Suspense fallback={null}>
                <PublicSessionBootstrap hasSessionCookie={hasSessionCookie} />
                <NavigationHistoryTracker />
              </Suspense>
              <SessionCookieProvider hasSessionCookie={hasSessionCookie}>
                <KeyboardPlatformProvider applePlatform={applePlatform}>
                  <NotificationsPreload initialNotifications={initialNotifications}>
                    <AccountClock now={initialNow} timeZone={initialAccount.timeZone}>{children}</AccountClock>
                  </NotificationsPreload>
                </KeyboardPlatformProvider>
              </SessionCookieProvider>
              <ThrottleScreen />
              <DesktopWindowBar />
            </RouteContext>
          </NextIntlClientProvider>
        </PostHogProvider>
      </body>
    </html>
  )
}
