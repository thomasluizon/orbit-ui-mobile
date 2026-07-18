import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import { Rubik, Inter, Roboto } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import { Bell, Check, X } from '@/components/ui/icons'
import { Toaster } from 'sonner'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { colorSchemeOptions, resolveDarkNeutrals, resolveLightNeutrals } from '@orbit/shared/theme'
import { NavigationHistoryTracker } from '@/components/navigation/navigation-history-tracker'
import './globals.css'

const rubik = Rubik({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-rubik',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
})

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-roboto',
  display: 'swap',
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.useorbit.org'),
    title: t('title'),
    description: t('description'),
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: resolveLightNeutrals('purple').bg },
    { media: '(prefers-color-scheme: dark)', color: resolveDarkNeutrals('purple').bg },
  ],
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
  const messages = await getMessages()
  const canvasByScheme = Object.fromEntries(
    colorSchemeOptions.map(({ value }) => [
      value,
      { dark: resolveDarkNeutrals(value).bg, light: resolveLightNeutrals(value).bg },
    ]),
  )
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

      const schemeNames = ['purple','blue','green','rose','orange','cyan']
      schemeNames.forEach((s) => root.classList.remove('scheme-' + s))
      const activeScheme = schemeNames.indexOf(schemeName) >= 0 ? schemeName : 'purple'
      root.classList.add('scheme-' + activeScheme)

      root.style.setProperty('color-scheme', themeName)

      const canvases = ${JSON.stringify(canvasByScheme)}
      document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
        meta.setAttribute('content', canvases[activeScheme][themeName])
      })
    } catch {}
  `

  return (
    <html lang={locale} className={`dark scheme-purple ${rubik.variable} ${inter.variable} ${roboto.variable}`} suppressHydrationWarning>
      <head>
        <script
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
