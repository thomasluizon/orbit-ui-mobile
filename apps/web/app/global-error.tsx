'use client'

import { useEffect, useSyncExternalStore } from 'react'
import * as Sentry from '@sentry/nextjs'
import { TriangleAlert } from '@/components/ui/icons'
import Link from 'next/link'
import { Rubik } from 'next/font/google'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import enMessages from '@orbit/shared/i18n/en.json'
import ptMessages from '@orbit/shared/i18n/pt-BR.json'
import { PillButton } from '@/components/ui/pill-button'
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

const errorTitleStyle = {
  margin: '18px 0 0',
  fontFamily: 'var(--font-sans)',
  fontSize: 22,
  fontWeight: 500,
  lineHeight: 1.3,
  color: 'var(--fg-1)',
  animation: 'slide-up-fade 0.28s var(--ease-out) backwards',
  animationDelay: '160ms',
}

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
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-9 py-16 text-center">
      <div className="flex max-w-[560px] flex-col items-center md:flex-row md:items-center md:gap-8 md:text-left">
        <div
          className="flex shrink-0 items-center justify-center rounded-full"
          style={{
            width: 80,
            height: 80,
            background: 'var(--bg-field)',
            boxShadow: 'inset 0 0 0 1px var(--hairline)',
            animation: 'fresh-start-orb 0.28s var(--ease-out) both',
          }}
        >
          <TriangleAlert size={34} strokeWidth={1.8} className="text-[var(--fg-3)]" />
        </div>
        <div className="flex flex-col items-center md:items-start">
          <p style={errorTitleStyle}>
            {t('common.somethingWentWrong')}
          </p>
          <div
            style={{
              marginTop: 22,
              animation: 'slide-up-fade 0.28s var(--ease-out) backwards',
              animationDelay: '240ms',
            }}
          >
            <PillButton onClick={reset}>{t('common.retry')}</PillButton>
          </div>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-[9px] rounded-full px-[26px] py-[14px] text-[16px] font-medium text-[var(--fg-1)] no-underline shadow-[inset_0_0_0_1.5px_var(--hairline-strong)] transition-[background-color,opacity,box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-card)] active:scale-[0.98]"
            style={{
              marginTop: 12,
              fontFamily: 'var(--font-sans)',
              animation: 'slide-up-fade 0.28s var(--ease-out) backwards',
              animationDelay: '300ms',
            }}
          >
            {t('common.goHome')}
          </Link>
        </div>
      </div>
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
