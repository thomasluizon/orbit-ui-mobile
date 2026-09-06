'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { FailureScreen } from '@/components/ui/failure-screen'

export default function AppError({ error, reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => { Sentry.captureException(error) }, [error])
  return <FailureScreen error={error} retry={reset} />
}
