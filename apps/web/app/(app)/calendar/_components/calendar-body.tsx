'use client'

import type { ReactNode } from 'react'
import { CalendarLoadError } from '@/components/calendar/calendar-load-error'

export function CalendarBody({ profileReady, profileError, onRetryProfile, error, onRetry, children }: Readonly<{
  profileReady: boolean
  profileError: Error | null
  onRetryProfile: () => void
  error: string | null
  onRetry: () => void
  children: ReactNode
}>) {
  if (!profileReady && profileError) return <CalendarLoadError onRetry={onRetryProfile} error={profileError} />
  if (profileReady && error) return <CalendarLoadError onRetry={onRetry} />
  return children
}
