'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'

export default function ChatError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string }
  reset: () => void
}>) {
  const t = useTranslations()

  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-9 py-16 text-center">
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: 80,
          height: 80,
          background: 'var(--bg-field)',
          boxShadow: 'inset 0 0 0 1px var(--hairline)',
          animation: 'fresh-start-orb 0.6s var(--ease-out) both',
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
          animation: 'slide-up-fade 0.28s var(--ease-out) backwards',
          animationDelay: '160ms',
        }}
      >
        {process.env.NODE_ENV === 'development' && error.message
          ? error.message
          : t('auth.genericError')}
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
    </div>
  )
}
