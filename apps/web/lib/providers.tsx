'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useUIStore } from '@/stores/ui-store'
import { useReferralPromptStore } from '@/stores/referral-prompt-store'
import { useShellStore } from '@/stores/shell-store'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { getQueryClient } from './query-client'
import type { ReactNode } from 'react'

export function Providers({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = getQueryClient()

  useEffect(() => {
    void useUIStore.persist.rehydrate()
    void useReferralPromptStore.persist.rehydrate()
    void useShellStore.persist.rehydrate()
    void useOnboardingDraftStore.persist.rehydrate()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
