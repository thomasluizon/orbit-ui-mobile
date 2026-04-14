import type { Metadata, Viewport } from 'next'
import { Manrope } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import { Toaster } from 'sonner'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { schemes } from '@orbit/shared/theme'
import { NavigationHistoryTracker } from '@/components/navigation/navigation-history-tracker'
import './globals.css'

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
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
      } else {
        root.classList.remove('dark')
      }

      const primary = themeName === 'light' ? def.primaryLight : def.primary
      root.style.setProperty('color-scheme', themeName)
      root.style.setProperty('--color-primary', primary)
      root.style.setProperty('--color-background', colors.background)
      root.style.setProperty('--color-surface-ground', colors.surfaceGround)
      root.style.setProperty('--color-surface', colors.surface)
      root.style.setProperty('--color-surface-elevated', colors.surfaceElevated)
      root.style.setProperty('--color-surface-overlay', colors.surfaceOverlay)
      root.style.setProperty('--color-card', colors.surface)
      root.style.setProperty('--color-card-border', colors.surfaceElevated)
      root.style.setProperty('--color-border', colors.border)
      root.style.setProperty('--color-border-muted', colors.borderMuted)
      root.style.setProperty('--color-border-emphasis', colors.borderEmphasis)
      root.style.setProperty('--color-text-primary', colors.textPrimary)
      root.style.setProperty('--color-text-secondary', colors.textSecondary)
      root.style.setProperty('--color-text-muted', colors.textMuted)
      root.style.setProperty('--color-text-faded', colors.textFaded)
      root.style.setProperty('--color-text-inverse', colors.textInverse)
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
    <html lang={locale} className={`dark ${manrope.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: themeBootstrapScript,
          }}
        />
      </head>
      <body className="bg-background text-text-primary font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <NavigationHistoryTracker />
          {children}
          <Toaster
            theme="dark"
            position="top-center"
            toastOptions={{
              style: {
                background: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
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
