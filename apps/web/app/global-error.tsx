'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { AlertTriangle } from 'lucide-react'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import enMessages from '@orbit/shared/i18n/en.json'
import './globals.css'

function GlobalErrorBody({ reset }: Readonly<{ reset: () => void }>) {
  const t = useTranslations()

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-9 py-16 text-center">
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: 80,
          height: 80,
          background: 'var(--bg-field)',
          boxShadow: 'inset 0 0 0 1px var(--hairline)',
        }}
      >
        <AlertTriangle size={34} strokeWidth={1.8} className="text-[var(--fg-3)]" />
      </div>
      <p
        style={{
          margin: '18px 0 0',
          fontFamily: 'var(--font-sans)',
          fontSize: 22,
          fontWeight: 500,
          lineHeight: 1.3,
          color: 'var(--fg-1)',
        }}
      >
        {t('auth.genericError')}
      </p>
      <button
        type="button"
        onClick={reset}
        style={{
          marginTop: 22,
          minHeight: 52,
          paddingInline: 28,
          borderRadius: 999,
          border: 'none',
          background: 'var(--primary)',
          color: 'var(--fg-on-primary)',
          fontFamily: 'var(--font-sans)',
          fontSize: 16,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        {t('common.retry')}
      </button>
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
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en" className="dark scheme-purple">
      <body className="bg-[var(--bg)] text-[var(--fg-1)] font-sans antialiased">
        <NextIntlClientProvider locale="en" messages={enMessages}>
          <GlobalErrorBody reset={reset} />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
