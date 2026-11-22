import type { ReactNode } from 'react'
import type { createTokensV2 } from '@/lib/theme'
import { CalendarLoadError } from './calendar-load-error'

export function CalendarBody({ profileReady, profileError, onRetryProfile, error, onRetry, tokens, children }: Readonly<{
  profileReady: boolean
  profileError: Error | null
  onRetryProfile: () => void
  error: string | null
  onRetry: () => void
  tokens: ReturnType<typeof createTokensV2>
  children: ReactNode
}>) {
  if (!profileReady && profileError) return <CalendarLoadError onRetry={onRetryProfile} tokens={tokens} error={profileError} />
  if (profileReady && error) return <CalendarLoadError onRetry={onRetry} tokens={tokens} />
  return children
}
