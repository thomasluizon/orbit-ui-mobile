'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useOnboardingDraftHydrated, useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { UpdateAvailableBanner } from '@/components/ui/update-available-banner'
import { AppToastHost } from '@/components/ui/app-toast-host'

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const sessionInactive = useAuthStore((state) => state.sessionInactive)
  const hydrated = useOnboardingDraftHydrated()
  const locallyDone = useOnboardingDraftStore((state) => state.onboardingLocallyDone)
  const showOnboarding = !isAuthenticated && !sessionInactive && !locallyDone
  useEffect(() => { void useOnboardingDraftStore.persist.rehydrate() }, [])
  useEffect(() => {
    if (hydrated && showOnboarding) router.replace('/onboarding')
  }, [hydrated, router, showOnboarding])
  if (!hydrated || showOnboarding) return null
  return <>
    <main className="flex min-h-dvh w-full flex-col items-center justify-center bg-[var(--bg)] text-[var(--fg-1)]"
      style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}>
      {children}
      <AppToastHost placement="page" />
    </main>
    <div className="fixed inset-x-0 top-[var(--safe-top)] z-sticky text-[var(--fg-1)]">
      <UpdateAvailableBanner />
    </div>
  </>
}
