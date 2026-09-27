'use client'

import { useEffect, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { isFeatureEnabled } from '@orbit/shared/utils'
import { useConfig } from '@/hooks/use-config'
import { getQueryClient } from '@/lib/query-client'
import { applyPostHogGate, initializePostHog } from '@/lib/posthog'

function PostHogGate() {
  const { config } = useConfig()
  const enabled = isFeatureEnabled(config, 'analytics', 'free')

  useEffect(() => {
    initializePostHog(enabled)
    applyPostHogGate(enabled)
  }, [enabled])

  return null
}

export function PostHogProvider({ children }: Readonly<{ children: ReactNode }>) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return children

  return (
    <QueryClientProvider client={getQueryClient()}>
      <PostHogGate />
      {children}
    </QueryClientProvider>
  )
}
