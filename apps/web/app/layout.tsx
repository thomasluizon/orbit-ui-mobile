import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { Suspense, type CSSProperties } from 'react'
import { Geist, Geist_Mono, Space_Grotesk } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import { Bell, Check, X } from '@/components/ui/icons'
import { Toaster } from 'sonner'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { neutralColors } from '@orbit/shared/theme'
import { NavigationHistoryTracker } from '@/components/navigation/navigation-history-tracker'
import { resolveWebThemeVariables, VALID_COLOR_SCHEMES } from '@/lib/theme-dom'
import './globals.css'

const geist = Geist({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-geist',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-geist-mono',
  display: 'swap',
})

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
const defaultThemeStyle = resolveWebThemeVariables('purple', 'dark') as CSSProperties

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  const title = t('title')
  const description = t('description')
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.useorbit.org'),
    title,
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
  const nonce = (await headers()).get('x-nonce') ?? undefined
  const themeBootstrapScript = `
    try {
      const cookie = document.cookie
      const readCookie = (name) => {
        const match = cookie.match(new RegExp('(?:^|; )' + name + '=([^;]+)'))
        return match ? decodeURIComponent(match[1]) : null
      }
      const schemeName = readCookie('orbit_color_scheme')
      const themeName = readCookie('orbit_theme_mode') === 'light' ? 'light' : 'dark'
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
      const activeScheme = schemeNames.indexOf(schemeName) >= 0 ? schemeName : 'purple'
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
      className={`dark scheme-purple ${geist.variable} ${spaceGrotesk.variable} ${geistMono.variable}`}
      style={defaultThemeStyle}
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
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Suspense fallback={null}>
            <NavigationHistoryTracker />
          </Suspense>
          {children}
          <Toaster
            theme="dark"
            position="top-center"
            icons={{
              success: <Check size={17} strokeWidth={2.4} />,
              error: <X size={17} strokeWidth={2.4} />,
              info: <Bell size={17} strokeWidth={2.4} />,
            }}
            toastOptions={{
              style: {
                background: 'var(--bg-sheet)',
                boxShadow:
                  '0 14px 36px rgba(0, 0, 0, 0.5), inset 0 0 0 1px var(--hairline)',
                border: 'none',
                color: 'var(--fg-1)',
                borderRadius: 18,
                padding: '14px 16px',
                gap: 12,
                alignItems: 'center',
                fontFamily: 'var(--font-sans)',
              },
            }}
          />
        </NextIntlClientProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
