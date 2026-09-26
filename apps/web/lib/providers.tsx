'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useShellStore } from '@/stores/shell-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { getQueryClient } from './query-client'
import type { ReactNode } from 'react'

export function Providers({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = getQueryClient()

  useEffect(() => {
    void useShellStore.persist.rehydrate()
    void useOnboardingDraftStore.persist.rehydrate()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
