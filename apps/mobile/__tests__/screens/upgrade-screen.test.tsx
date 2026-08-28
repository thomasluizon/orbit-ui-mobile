import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'

import UpgradeScreen from '@/app/upgrade'

const TestRenderer = require('react-test-renderer')

type TestNode = {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
  openURL: vi.fn(),
  isOnline: true,
  from: undefined as string | undefined,
  hasProAccess: false,
  trialDaysLeft: 5,
  profile: null as ReturnType<typeof createMockProfile> | null,
  plans: { couponPercentOff: 0 },
  billing: undefined as Record<string, unknown> | undefined,
  statusLoading: false,
  statusError: false,
  billingLoading: false,
  billingError: false,
  lapseReason: null as 'canceled' | 'payment_failed' | 'expired' | null,
  subscriptionEndedAtUtc: null as string | null,
  goBack: vi.fn(),
  refetchPlans: vi.fn(() => Promise.resolve()),
  refetchBilling: vi.fn(() => Promise.resolve()),
  refetchStatus: vi.fn(() => Promise.resolve()),
  playBilling: {
    isProcessing: false,
    errorKey: '',
    clearError: vi.fn(),
    purchase: vi.fn(() => Promise.resolve()),
    restorePurchases: vi.fn(() => Promise.resolve()),
    yearlyOffer: { displayPrice: 'R$99' },
    monthlyOffer: { displayPrice: 'R$12' },
    isReferralPricing: false,
    isRestoring: false,
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ from: mocks.from }),
}))

vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>()
  return {
    ...actual,
    Linking: { openURL: (...args: unknown[]) => mocks.openURL(...args) },
  }
})

vi.mock('@/lib/api-client', () => ({
  apiClient: (...args: unknown[]) => mocks.apiClient(...args),
}))
vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOnline: mocks.isOnline }),
}))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => mocks.goBack,
}))
vi.mock('@/hooks/use-billing', () => ({
  useBilling: () => ({
    billing: mocks.billing,
    isLoading: mocks.billingLoading,
    isError: mocks.billingError,
    refetch: mocks.refetchBilling,
  }),
}))
vi.mock('@/hooks/use-play-billing', () => ({
  usePlayBilling: () => mocks.playBilling,
}))
vi.mock('@/hooks/use-subscription-plans', () => ({
  useSubscriptionPlans: () => ({
    plans: mocks.plans,
    isLoading: false,
    isError: false,
    refetch: mocks.refetchPlans,
  }),
}))
vi.mock('@/hooks/use-subscription-status', () => ({
  useSubscriptionStatus: () => ({
    status: mocks.profile
      ? {
          plan: mocks.hasProAccess ? 'pro' : 'free',
          hasProAccess: mocks.hasProAccess,
          isTrialActive: mocks.profile.isTrialActive,
          trialEndsAt: mocks.profile.trialEndsAt,
          planExpiresAt: mocks.profile.planExpiresAt,
          aiMessagesUsed: mocks.profile.aiMessagesUsed,
          aiMessagesLimit: mocks.profile.aiMessagesLimit,
          isLifetimePro: mocks.profile.isLifetimePro,
          subscriptionInterval: mocks.profile.subscriptionInterval ?? null,
          source: mocks.profile.subscriptionSource ?? null,
          lapseReason: mocks.lapseReason,
          subscriptionEndedAtUtc: mocks.subscriptionEndedAtUtc,
        }
      : null,
    isLoading: mocks.statusLoading,
    isError: mocks.statusError,
    refetch: mocks.refetchStatus,
  }),
}))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.profile }),
  useHasProAccess: () => mocks.hasProAccess,
  useTrialDaysLeft: () => mocks.trialDaysLeft,
}))
vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showSuccess: vi.fn() }),
}))

const tokensProxy = new Proxy({}, { get: () => '#111111' }) as Record<string, string>
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))
vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, createTokensV2: () => tokensProxy }
})

vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))
vi.mock('@/components/ui/offline-unavailable-state', () => ({
  OfflineUnavailableState: () => React.createElement('OfflineUnavailableState'),
}))
vi.mock('@/components/upgrade/billing-dashboard', () => ({
  BillingDashboard: (props: Record<string, unknown>) =>
    React.createElement('BillingDashboard', props),
}))
vi.mock('@/components/upgrade/play-billing-dashboard', () => ({
  PlayBillingDashboard: (props: Record<string, unknown>) =>
    React.createElement('PlayBillingDashboard', props),
}))
vi.mock('@/components/upgrade/pricing-section', () => ({
  PricingSection: (props: Record<string, unknown>) => React.createElement('PricingSection', props),
}))
vi.mock('@/components/upgrade/pricing-footer', () => ({
  PricingFooter: (props: Record<string, unknown>) => React.createElement('PricingFooter', props),
}))

async function renderScreen() {
  let tree: { root: TestNode } | undefined
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<UpgradeScreen />)
    await Promise.resolve()
  })
  return tree!
}

function findByType(root: TestNode, type: string) {
  return root.findAll((node) => node.type === type)[0]!
}

describe('UpgradeScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isOnline = true
    mocks.from = undefined
    mocks.hasProAccess = false
    mocks.trialDaysLeft = 5
    mocks.profile = createMockProfile({
      isTrialActive: false,
      subscriptionSource: 'stripe',
    })
    mocks.plans = { couponPercentOff: 0 }
    mocks.billing = { plan: 'yearly' }
    mocks.statusLoading = false
    mocks.statusError = false
    mocks.billingLoading = false
    mocks.billingError = false
    mocks.lapseReason = null
    mocks.subscriptionEndedAtUtc = null
    mocks.playBilling.isProcessing = false
    mocks.playBilling.errorKey = ''
  })

  it('shows the pricing section and footer for a free user', async () => {
    const tree = await renderScreen()
    expect(findByType(tree.root, 'PricingSection')).toBeTruthy()
    expect(findByType(tree.root, 'PricingFooter')).toBeTruthy()
  })

  it.each([
    ['loading', true, false, 'common.loading'],
    ['load-failed', false, true, 'upgrade.billing.error'],
  ] as const)('renders the %s status outcome', async (_state, statusLoading, statusError, label) => {
    mocks.statusLoading = statusLoading
    mocks.statusError = statusError
    const tree = await renderScreen()
    expect(
      tree.root.findAll((node) => node.props.children === label || node.props.label === label).length,
    ).toBeGreaterThan(0)
    expect(tree.root.findAll((node) => node.type === 'PricingFooter')).toHaveLength(0)
  })

  it.each([
    ['loading', true, false],
    ['load-failed', false, true],
  ] as const)('renders the Stripe billing %s outcome', async (state, billingLoading, billingError) => {
    mocks.hasProAccess = true
    mocks.billingLoading = billingLoading
    mocks.billingError = billingError
    const tree = await renderScreen()
    if (state === 'loading') {
      expect(
        tree.root.findAll((node) => node.props.children === 'common.loading'
          || node.props.label === 'common.loading').length,
      ).toBeGreaterThan(0)
    } else {
      expect(tree.root.findAll((node) => node.props.children === 'upgrade.billing.error').length).toBeGreaterThan(0)
    }
    expect(tree.root.findAll((node) => node.type === 'BillingDashboard')).toHaveLength(0)
  })

  it.each([
    ['canceled', { status: 'active', cancelAtPeriodEnd: true }],
    ['past-due', { status: 'past_due', cancelAtPeriodEnd: false }],
  ] as const)('passes the %s outcome to the Stripe dashboard', async (state, billing) => {
    mocks.hasProAccess = true
    mocks.billing = billing
    const tree = await renderScreen()
    expect(findByType(tree.root, 'BillingDashboard').props.state).toBe(state)
  })

  it('passes the lifetime outcome without requesting Stripe billing content', async () => {
    mocks.hasProAccess = true
    mocks.profile = createMockProfile({
      isTrialActive: false,
      isLifetimePro: true,
      subscriptionSource: null,
    })
    mocks.billing = undefined
    const tree = await renderScreen()
    expect(findByType(tree.root, 'BillingDashboard').props.state).toBe('lifetime')
  })

  it.each(['canceled', 'payment_failed', 'expired'] as const)(
    'renders the %s lapse outcome with cached content',
    async (lapseReason) => {
      mocks.lapseReason = lapseReason
      mocks.subscriptionEndedAtUtc = '2026-08-01T00:00:00Z'
      const tree = await renderScreen()
      expect(
        tree.root.findAll((node) => node.props.children === `upgrade.billing.lapsed.${lapseReason}`).length,
      ).toBeGreaterThan(0)
      expect(findByType(tree.root, 'PricingSection')).toBeTruthy()
    },
  )

  it('starts a purchase through the footer checkout', async () => {
    const tree = await renderScreen()
    const footer = findByType(tree.root, 'PricingFooter')
    await TestRenderer.act(async () => {
      ;(footer.props.onCheckout as (i: string) => void)('yearly')
      await Promise.resolve()
    })
    expect(mocks.playBilling.clearError).toHaveBeenCalledTimes(1)
    expect(mocks.playBilling.purchase).toHaveBeenCalledWith('yearly')
  })

  it('switches the selected interval and echoes the new price', async () => {
    const tree = await renderScreen()
    const section = findByType(tree.root, 'PricingSection')
    await TestRenderer.act(async () => {
      ;(section.props.onSelectInterval as (i: string) => void)('monthly')
      await Promise.resolve()
    })
    expect(findByType(tree.root, 'PricingFooter').props.selectedInterval).toBe('monthly')
  })

  it('routes back to the fallback when the user stays free', async () => {
    mocks.from = '/profile'
    const tree = await renderScreen()
    await TestRenderer.act(() => {
      ;(findByType(tree.root, 'PricingSection').props.onStayFree as () => void)()
    })
    expect(mocks.goBack).toHaveBeenCalledWith('/profile')
  })

  it('restores purchases and retries plan loading via the pricing section', async () => {
    const tree = await renderScreen()
    const section = findByType(tree.root, 'PricingSection')
    await TestRenderer.act(async () => {
      ;(section.props.onRestore as () => void)()
      ;(section.props.onRetryPlans as () => void)()
      await Promise.resolve()
    })
    expect(mocks.playBilling.restorePurchases).toHaveBeenCalledTimes(1)
    expect(mocks.refetchPlans).toHaveBeenCalledTimes(1)
  })

  it('opens the Stripe portal for a paying stripe user', async () => {
    mocks.hasProAccess = true
    mocks.apiClient.mockResolvedValue({ url: 'https://portal.stripe.test' })
    const tree = await renderScreen()
    const dashboard = findByType(tree.root, 'BillingDashboard')
    await TestRenderer.act(async () => {
      ;(dashboard.props.onPortal as () => void)()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
    expect(mocks.openURL).toHaveBeenCalledWith('https://portal.stripe.test')
  })

  it('reports the offline message when opening the portal while disconnected', async () => {
    mocks.hasProAccess = true
    mocks.isOnline = false
    const tree = await renderScreen()
    const dashboard = findByType(tree.root, 'BillingDashboard')
    await TestRenderer.act(async () => {
      ;(dashboard.props.onPortal as () => void)()
      await Promise.resolve()
    })
    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(findByType(tree.root, 'BillingDashboard').props.state).toBe('offline')
  })

  it.each([false, true])('keeps cached pitch content offline, trial=%s', async (trialActive) => {
    mocks.isOnline = false
    mocks.hasProAccess = trialActive
    mocks.profile = createMockProfile({
      isTrialActive: trialActive,
      trialEndsAt: trialActive
        ? new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
        : null,
      subscriptionInterval: null,
      subscriptionSource: null,
    })
    const tree = await renderScreen()
    const section = findByType(tree.root, 'PricingSection')
    expect(section).toBeTruthy()
    if (trialActive) {
      expect(section.props.trialDaysLeft).toBeGreaterThan(0)
    } else {
      expect(section.props.trialDaysLeft).toBeNull()
    }
    expect(tree.root.findAll((node) => node.type === 'PricingFooter')).toHaveLength(0)
  })

  it('keeps the Play dashboard and blocks its handoff while offline', async () => {
    mocks.isOnline = false
    mocks.hasProAccess = true
    mocks.profile = createMockProfile({
      isTrialActive: false,
      subscriptionSource: 'play',
      subscriptionInterval: 'yearly',
    })
    const tree = await renderScreen()
    const dashboard = findByType(tree.root, 'PlayBillingDashboard')
    expect(dashboard.props.isOnline).toBe(false)
    expect(tree.root.findAll((node) => node.type === 'BillingDashboard')).toHaveLength(0)
    await TestRenderer.act(async () => {
      ;(dashboard.props.onManagePlay as () => void)()
      await Promise.resolve()
    })
    expect(mocks.openURL).not.toHaveBeenCalled()
  })

  it('opens the Play management URL for a play-sourced subscriber', async () => {
    mocks.hasProAccess = true
    mocks.profile = createMockProfile({
      isTrialActive: false,
      subscriptionSource: 'play',
    })
    mocks.openURL.mockResolvedValue(undefined)
    const tree = await renderScreen()
    const dashboard = findByType(tree.root, 'PlayBillingDashboard')
    await TestRenderer.act(async () => {
      ;(dashboard.props.onManagePlay as () => void)()
      await Promise.resolve()
    })
    expect(mocks.openURL).toHaveBeenCalledTimes(1)
  })

  it('clears the pending checkout once play billing stops processing', async () => {
    let tree: { root: TestNode; update: (element: React.ReactElement) => void } | undefined
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<UpgradeScreen />)
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      ;(findByType(tree!.root, 'PricingFooter').props.onCheckout as (i: string) => void)('monthly')
      await Promise.resolve()
    })
    expect(findByType(tree!.root, 'PricingFooter').props.checkoutLoading).toBe('monthly')

    mocks.playBilling.isProcessing = true
    await TestRenderer.act(() => {
      tree!.update(<UpgradeScreen />)
    })
    expect(findByType(tree!.root, 'PricingFooter').props.checkoutLoading).toBe('monthly')

    mocks.playBilling.isProcessing = false
    await TestRenderer.act(() => {
      tree!.update(<UpgradeScreen />)
    })
    expect(findByType(tree!.root, 'PricingFooter').props.checkoutLoading).toBeNull()
  })
})
