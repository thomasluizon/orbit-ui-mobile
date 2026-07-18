'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { TriangleAlert } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { EmptyState } from '@/components/ui/empty-state'

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
    <div className="flex min-h-[60dvh] items-center justify-center">
      <EmptyState
        icon={TriangleAlert}
        description={message}
        action={{ label: t('common.retry'), onClick: reset }}
      />
    </div>
  )
}
