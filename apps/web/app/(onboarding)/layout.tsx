'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useOnboardingDraftHydrated, useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { Providers } from '@/lib/providers'
import { FlowShell } from '@/components/shell/flow-shell'

/** Public onboarding group shell: mounts the app providers for the pre-auth wizard. */
export default function OnboardingLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const router = useRouter()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const hydrated = useOnboardingDraftHydrated()
  const locallyDone = useOnboardingDraftStore((state) => state.onboardingLocallyDone)
  useEffect(() => { void useOnboardingDraftStore.persist.rehydrate() }, [])
  useEffect(() => {
    if (hydrated && (isAuthenticated || locallyDone)) router.replace(isAuthenticated ? '/' : '/login')
  }, [hydrated, isAuthenticated, locallyDone, router])
  if (!hydrated || isAuthenticated || locallyDone) return null
  return (
    <Providers>
      <FlowShell>{children}</FlowShell>
    </Providers>
  )
}
