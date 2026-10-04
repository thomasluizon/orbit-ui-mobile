'use client'

import { useEffect, useSyncExternalStore } from 'react'
import * as Sentry from '@sentry/nextjs'
import { geist, geistMono, spaceGrotesk } from './fonts'
import { NextIntlClientProvider } from 'next-intl'
import enMessages from '@orbit/shared/i18n/en.json'
import ptMessages from '@orbit/shared/i18n/pt-BR.json'
import { FailureScreen } from '@/components/ui/failure-screen'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import './globals.css'

function readCookie(name: string): string | null {
  const match = new RegExp('(?:^|; )' + name + '=([^;]+)').exec(document.cookie)
  const value = match?.[1]
  return value !== undefined ? decodeURIComponent(value) : null
}

const DEFAULT_CLIENT_PREFS = 'en|dark'

const emptySubscribe = () => () => {}

function readClientPrefs(): string {
  const locale = readCookie('i18n_locale') === 'pt-BR' ? 'pt-BR' : 'en'
  const theme = readCookie('orbit_theme_mode') === 'light' ? 'light' : 'dark'
  return `${locale}|${theme}`
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
  const [locale = 'en', themeValue = 'dark'] = clientPrefs.split('|')
  const theme = themeValue === 'light' ? 'light' : 'dark'

  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  const messages = locale === 'pt-BR' ? ptMessages : enMessages

  return (
    <html
      lang={locale}
      className={`${theme} ${geist.variable} ${spaceGrotesk.variable} ${geistMono.variable}`}
      style={resolveWebThemeVariables('orange', theme)}
    >
      <body className="bg-[var(--bg)] text-[var(--fg-1)] font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <main className="min-h-dvh pt-[var(--safe-top)] pb-[var(--safe-bottom)] pl-[var(--safe-left)] pr-[var(--safe-right)]"><FailureScreen error={error} retry={reset} /></main>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
