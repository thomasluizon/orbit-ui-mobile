'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { getQueryClient } from './query-client'
import type { ReactNode } from 'react'
import { ShellScrollerProvider } from '@/components/shell/shell-scroller-context'

export function Providers({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = getQueryClient()

  useEffect(() => {
    void useOnboardingDraftStore.persist.rehydrate()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ShellScrollerProvider>{children}</ShellScrollerProvider>
    </QueryClientProvider>
  )
}
