'use client'

import { useEffect, useSyncExternalStore } from 'react'
import * as Sentry from '@sentry/nextjs'
import { TriangleAlert } from '@/components/ui/icons'
import { Rubik } from 'next/font/google'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import enMessages from '@orbit/shared/i18n/en.json'
import ptMessages from '@orbit/shared/i18n/pt-BR.json'
import { PillButton } from '@/components/ui/pill-button'
import { EmptyState } from '@/components/ui/empty-state'
import './globals.css'

const rubik = Rubik({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-rubik',
  display: 'swap',
})

const SCHEME_NAMES = new Set(['purple', 'blue', 'green', 'rose', 'orange', 'cyan'])

function readCookie(name: string): string | null {
  const match = new RegExp('(?:^|; )' + name + '=([^;]+)').exec(document.cookie)
  const value = match?.[1]
  return value !== undefined ? decodeURIComponent(value) : null
}

const DEFAULT_CLIENT_PREFS = 'en|dark scheme-purple'

const emptySubscribe = () => () => {}

function readClientPrefs(): string {
  const locale = readCookie('i18n_locale') === 'pt-BR' ? 'pt-BR' : 'en'
  const theme = readCookie('orbit_theme_mode') === 'light' ? 'light' : 'dark'
  const schemeCookie = readCookie('orbit_color_scheme')
  const scheme =
    schemeCookie && SCHEME_NAMES.has(schemeCookie) ? schemeCookie : 'purple'
  return `${locale}|${theme} scheme-${scheme}`
}

function GlobalErrorBody({ reset }: Readonly<{ reset: () => void }>) {
  const t = useTranslations()

  return (
    <div className="flex min-h-[100dvh] items-center justify-center">
      <EmptyState
        icon={TriangleAlert}
        description={t('common.somethingWentWrong')}
        action={{ label: t('common.retry'), onClick: reset }}
        footer={
          <PillButton variant="ghost" href="/">
            {t('common.goHome')}
          </PillButton>
        }
      />
    </div>
  )
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
  const [locale = 'en', htmlClass = 'dark scheme-purple'] = clientPrefs.split('|')

  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  const messages = locale === 'pt-BR' ? ptMessages : enMessages

  return (
    <html lang={locale} className={`${htmlClass} ${rubik.variable}`}>
      <body className="bg-[var(--bg)] text-[var(--fg-1)] font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <GlobalErrorBody reset={reset} />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
