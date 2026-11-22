'use client'

import type { ReactNode } from 'react'
import { CalendarLoadError } from '@/components/calendar/calendar-load-error'
import { useFlag } from '@/hooks/use-flag'

export function CalendarBody({ profileReady, profileError, onRetryProfile, error, onRetry, children }: Readonly<{
  profileReady: boolean
  profileError: Error | null
  onRetryProfile: () => void
  error: string | null
  onRetry: () => void
  children: ReactNode
}>) {
  const guided = useFlag('orbit_guided_flows')
  if (!profileReady && profileError) return <CalendarLoadError onRetry={onRetryProfile} error={profileError} />
  if (profileReady && error) return guided ? <CalendarLoadError onRetry={onRetry} /> : <div style={{ padding: "var(--orbit-space-0) var(--orbit-space-16) var(--orbit-space-16)" }}><CalendarLoadError onRetry={onRetry} /></div>
  return children
}
