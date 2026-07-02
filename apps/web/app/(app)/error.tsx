'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { TriangleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'

export default function AppError({
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

  const message =
    process.env.NODE_ENV === 'development' && error.message
      ? error.message
      : t('common.somethingWentWrong')

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-9 py-16 text-center">
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
          <h1
            className="t-h2"
            style={{
              margin: '18px 0 0',
              textWrap: 'balance',
              animation: 'slide-up-fade 0.28s var(--ease-out) backwards',
              animationDelay: '160ms',
            }}
          >
            {message}
          </h1>
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
      </div>
    </div>
  )
}
