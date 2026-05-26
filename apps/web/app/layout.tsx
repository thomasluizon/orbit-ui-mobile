import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import { Toaster } from 'sonner'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { schemes } from '@orbit/shared/theme'
import { NavigationHistoryTracker } from '@/components/navigation/navigation-history-tracker'
import './globals.css'

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return {
    title: t('title'),
    description: t('description'),
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#07060e',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
  const messages = await getMessages()
  const themeBootstrapScript = `
    try {
      const cookie = document.cookie
      const readCookie = (name) => {
        const match = cookie.match(new RegExp('(?:^|; )' + name + '=([^;]+)'))
        return match ? decodeURIComponent(match[1]) : null
      }
      const schemeName = readCookie('orbit_color_scheme')
      const themeName = readCookie('orbit_theme_mode') === 'light' ? 'light' : 'dark'
      const defs = ${JSON.stringify(schemes)}
      const fallback = defs.purple
      const def = defs[schemeName] ?? fallback
      const colors = def[themeName]
      const root = document.documentElement

      if (themeName === 'dark') {
        root.classList.add('dark')
        root.classList.remove('light')
      } else {
        root.classList.add('light')
        root.classList.remove('dark')
      }

      // v2: scheme class enables OKLCH neutrals via .scheme-{name}.dark|.light rules.
      const schemeNames = ['purple','blue','green','rose','orange','cyan']
      schemeNames.forEach((s) => root.classList.remove('scheme-' + s))
      const activeScheme = schemeNames.indexOf(schemeName) >= 0 ? schemeName : 'purple'
      root.classList.add('scheme-' + activeScheme)

      // v8 migration: --color-* tokens are aliased to v8 vars (--bg, --fg-1, ...) in
      // globals.css @theme, so we no longer overwrite them here. Per-scheme --primary
      // is driven by the .scheme-{name} class added above. We still inject the shadow
      // and nav-glass tokens since those are not yet aliased to v8.
      root.style.setProperty('color-scheme', themeName)
      root.style.setProperty('--shadow-sm', colors.shadowSm)
      root.style.setProperty('--shadow-md', colors.shadowMd)
      root.style.setProperty('--shadow-lg', colors.shadowLg)
      root.style.setProperty('--shadow-glow', colors.shadowGlow)
      root.style.setProperty('--shadow-glow-sm', colors.shadowGlowSm)
      root.style.setProperty('--shadow-glow-lg', colors.shadowGlowLg)
      root.style.setProperty('--nav-glass-bg', colors.navGlassBg)
      root.style.setProperty('--nav-glass-border', colors.navGlassBorder)
      root.style.setProperty('--primary-shadow', def.shadowRgb)
      root.style.setProperty('--date-icon-filter', themeName === 'dark' ? 'invert(0.6)' : 'none')

      const tint = themeName === 'light'
        ? { bg: 0.3, bgHover: 0.38, border: 0.5, borderHover: 0.62, iconBg: 0.42, iconBgHover: 0.52 }
        : { bg: 0.1, bgHover: 0.15, border: 0.2, borderHover: 0.3, iconBg: 0.2, iconBgHover: 0.3 }
      root.style.setProperty('--primary-tint-bg', 'rgba(' + def.shadowRgb + ', ' + tint.bg + ')')
      root.style.setProperty('--primary-tint-bg-hover', 'rgba(' + def.shadowRgb + ', ' + tint.bgHover + ')')
      root.style.setProperty('--primary-tint-border', 'rgba(' + def.shadowRgb + ', ' + tint.border + ')')
      root.style.setProperty('--primary-tint-border-hover', 'rgba(' + def.shadowRgb + ', ' + tint.borderHover + ')')
      root.style.setProperty('--primary-tint-icon-bg', 'rgba(' + def.shadowRgb + ', ' + tint.iconBg + ')')
      root.style.setProperty('--primary-tint-icon-bg-hover', 'rgba(' + def.shadowRgb + ', ' + tint.iconBgHover + ')')

      const scale = def.scale
      root.style.setProperty('--color-primary-50', scale['50'] ?? '')
      root.style.setProperty('--color-primary-100', scale['100'] ?? '')
      root.style.setProperty('--color-primary-200', scale['200'] ?? '')
      root.style.setProperty('--color-primary-300', scale['300'] ?? '')
      root.style.setProperty('--color-primary-400', scale['400'] ?? '')
      root.style.setProperty('--color-primary-500', scale['500'] ?? '')
      root.style.setProperty('--color-primary-600', scale['600'] ?? '')
      root.style.setProperty('--color-primary-700', scale['700'] ?? '')
      root.style.setProperty('--color-primary-800', scale['800'] ?? '')
      root.style.setProperty('--color-primary-900', scale['900'] ?? '')
      root.style.setProperty('--color-primary-950', scale['950'] ?? '')

      const metaThemeColor = document.querySelector('meta[name="theme-color"]')
      if (metaThemeColor) metaThemeColor.setAttribute('content', colors.background)
    } catch {}
  `

  return (
    <html lang={locale} className={`dark scheme-purple ${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: themeBootstrapScript,
          }}
        />
      </head>
      <body className="bg-[var(--bg)] text-[var(--fg-1)] font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <NavigationHistoryTracker />
          {children}
          <Toaster
            theme="dark"
            position="top-center"
            toastOptions={{
              // v8 toast chrome: flat bg-elev, hairline inset shadow, no corner glow.
              style: {
                background: 'var(--bg-elev)',
                boxShadow:
                  '0 8px 24px rgba(0,0,0,0.30), inset 0 0 0 1px var(--hairline)',
                border: 'none',
                color: 'var(--fg-1)',
                borderRadius: 10,
                fontFamily: 'var(--font-family-sans)',
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
