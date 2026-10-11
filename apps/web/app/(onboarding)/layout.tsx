'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getOnboardingLoginUrl } from '@/lib/onboarding-login-route'
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
  const hydrated = useOnboardingDraftHydrated()
  useEffect(() => { void useOnboardingDraftStore.persist.rehydrate() }, [])
  return hydrated ? <HydratedOnboardingLayout>{children}</HydratedOnboardingLayout> : null
}

function HydratedOnboardingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter()
  const loginUrl = getOnboardingLoginUrl(useSearchParams().toString())
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const [locallyDone] = useState(() => useOnboardingDraftStore.getState().onboardingLocallyDone)
  useEffect(() => {
    if (isAuthenticated || locallyDone) router.replace(isAuthenticated ? '/' : loginUrl)
  }, [isAuthenticated, locallyDone, loginUrl, router])
  if (isAuthenticated || locallyDone) return null
  return (
    <Providers>
      <FlowShell>{children}</FlowShell>
    </Providers>
  )
}
