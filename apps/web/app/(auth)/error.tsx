'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { useTranslations } from 'next-intl'
import { ErrorState } from '@/components/ui/error-state'
import { PillButton } from '@/components/ui/pill-button'

export default function AuthError({ error, reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const t = useTranslations()
  useEffect(() => { Sentry.captureException(error) }, [error])
  return <ErrorState message={t('auth.genericError')} action={
    /* eslint-disable-next-line local/max-button-words -- ORB-68 owns this existing label. */
    <PillButton onClick={reset}>{t('common.retry')}</PillButton>
  } />
}
