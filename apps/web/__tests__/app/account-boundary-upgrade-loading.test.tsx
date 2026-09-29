import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import UpgradePage from '@/app/(app)/upgrade/page'
import { RenderedAccountSeed } from '@/app/(app)/rendered-account-seed'
import { getQueryClient } from '@/lib/query-client'
import { respondWithAccount, retireHeldAccount } from '@/__tests__/support/account-change'
import { useAuthStore } from '@/stores/auth-store'

const fetchWithThrottle = vi.hoisted(() => vi.fn())
vi.mock('@/lib/throttle-fetch', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/throttle-fetch')>(),
  fetchWithThrottle,
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))
vi.mock('@/lib/plural', () => ({ plural: (value: string) => value }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('@/hooks/use-subscription-plans', () => ({
  useSubscriptionPlans: () => ({ plans: null, isLoading: false, isError: false, refetch: vi.fn(), discountedAmount: vi.fn() }),
}))
vi.mock('@/hooks/use-billing', () => ({
  useBilling: () => ({ billing: null, isLoading: false, isError: false, refetch: vi.fn() }),
}))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showSuccess: vi.fn(), showPersistentError: vi.fn() }),
}))
vi.mock('@/lib/actions/subscription', () => ({ openCustomerPortal: vi.fn() }))
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => <div data-testid="upgrade-loading" /> }))
vi.mock('@/components/upgrade/billing-dashboard', () => ({ BillingDashboard: () => null }))
vi.mock('@/components/upgrade/play-billing-dashboard', () => ({ PlayBillingDashboard: () => null }))
vi.mock('@/components/upgrade/pricing-section', () => ({ PricingSection: () => null }))
vi.mock('@/components/upgrade/usage-stats', () => ({ UsageStats: () => null }))
vi.mock('@/components/upgrade/subscription-notice', () => ({ SubscriptionNotice: () => null }))

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  fetchWithThrottle.mockReset()
})
afterEach(() => {
  getQueryClient().clear()
  vi.unstubAllGlobals()
})

it('lets UpgradePage leave loading after a held subscription request answers across the first check', async () => {
  await retireHeldAccount()
  getQueryClient().clear()
  let answer!: (response: Response) => void
  fetchWithThrottle.mockReturnValue(new Promise<Response>((resolve) => { answer = resolve }))
  render(
    <QueryClientProvider client={getQueryClient()}>
      <RenderedAccountSeed accountId="user-1"><UpgradePage /></RenderedAccountSeed>
    </QueryClientProvider>,
  )
  await waitFor(() => expect(fetchWithThrottle).toHaveBeenCalled())
  expect(screen.getAllByTestId('upgrade-loading')).toHaveLength(3)

  respondWithAccount('user-1')
  await act(async () => { await useAuthStore.getState().checkSession() })
  await act(async () => answer({
    ok: true,
    status: 200,
    json: async () => ({
      plan: 'free', hasProAccess: false, isTrialActive: false,
      trialEndsAt: null, planExpiresAt: null, aiMessagesUsed: 0,
      aiMessagesLimit: 5, isLifetimePro: false, subscriptionInterval: null,
      source: null, lapseReason: null, subscriptionEndedAtUtc: null,
    }),
  } as Response))

  await waitFor(() => expect(screen.queryByTestId('upgrade-loading')).toBeNull())
})
