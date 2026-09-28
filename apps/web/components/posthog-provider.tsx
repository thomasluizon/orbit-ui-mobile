'use client'

import { useEffect, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { useConfig } from '@/hooks/use-config'
import { getQueryClient } from '@/lib/query-client'
import { applyPostHogGate } from '@/lib/posthog'

function PostHogGate() {
  const { config, isFetchedAfterMount, isFetching, refetch } = useConfig()
  const enabled = isFetchedAfterMount && !isFetching && config.features.analytics?.enabled === true

  useEffect(() => {
    void refetch()
  }, [refetch])

  useEffect(() => {
    void applyPostHogGate(enabled)
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
