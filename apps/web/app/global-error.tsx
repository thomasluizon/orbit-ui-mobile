'use client'

import { useEffect, useSyncExternalStore } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Geist, Geist_Mono, Space_Grotesk } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import enMessages from '@orbit/shared/i18n/en.json'
import ptMessages from '@orbit/shared/i18n/pt-BR.json'
import { FailureScreen } from '@/components/ui/failure-screen'
import { normalizeColorScheme, resolveWebThemeVariables } from '@/lib/theme-dom'
import './globals.css'

const geist = Geist({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-geist',
  display: 'swap',
})

const display = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-space-grotesk', display: 'swap' })
const mono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-geist-mono', display: 'swap' })

const SCHEME_NAMES = new Set(['purple', 'blue', 'green', 'rose', 'orange', 'cyan'])

function readCookie(name: string): string | null {
  const match = new RegExp('(?:^|; )' + name + '=([^;]+)').exec(document.cookie)
  const value = match?.[1]
  return value !== undefined ? decodeURIComponent(value) : null
}

const DEFAULT_CLIENT_PREFS = 'en|dark|purple'

const emptySubscribe = () => () => {}

function readClientPrefs(): string {
  const locale = readCookie('i18n_locale') === 'pt-BR' ? 'pt-BR' : 'en'
  const theme = readCookie('orbit_theme_mode') === 'light' ? 'light' : 'dark'
  const schemeCookie = readCookie('orbit_color_scheme')
  const scheme =
    schemeCookie && SCHEME_NAMES.has(schemeCookie) ? schemeCookie : 'purple'
  return `${locale}|${theme}|${scheme}`
}

export default function GlobalError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string }
  reset: () => void
}>) {
  const clientPrefs = useSyncExternalStore(
    emptySubscribe,
    readClientPrefs,
    () => DEFAULT_CLIENT_PREFS,
  )
  const [locale = 'en', themeValue = 'dark', schemeValue = 'purple'] = clientPrefs.split('|')
  const theme = themeValue === 'light' ? 'light' : 'dark'
  const scheme = normalizeColorScheme(schemeValue)

  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  const messages = locale === 'pt-BR' ? ptMessages : enMessages

  return (
    <html
      lang={locale}
      className={`${theme} ${geist.variable} ${display.variable} ${mono.variable}`}
      style={resolveWebThemeVariables(scheme, theme)}
    >
      <body className="bg-[var(--bg)] text-[var(--fg-1)] font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <main className="min-h-dvh"><FailureScreen error={error} retry={reset} /></main>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
