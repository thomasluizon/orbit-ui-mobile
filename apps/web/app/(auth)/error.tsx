'use client'

import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { useTranslations } from 'next-intl'
import { ErrorState } from '@/components/ui/error-state'

export default function AuthError({ error, reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const t = useTranslations()
  useEffect(() => { Sentry.captureException(error) }, [error])
  return <ErrorState message={t('auth.genericError')} action={
    <IconButton label={t('common.retry')} onClick={reset}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
  } />
}
