'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { useTranslations } from 'next-intl'
import { TriangleAlert } from '@/components/ui/icons'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * Error boundary for auth pages (login, auth-callback).
 */
export default function AuthError({
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
      : t('auth.genericError')

  return (
    <EmptyState
      icon={TriangleAlert}
      description={message}
      action={{ label: t('common.retry'), onClick: reset }}
    />
  )
}
