import React from 'react'
import { createRequire } from 'node:module'
import appJson from '../../app.json'
import type { AppStateStatus } from 'react-native'
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { createInstance } from 'i18next'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'

import UpgradeScreen from '@/app/upgrade'

const requireConfig = createRequire(import.meta.url)
const createConfig = requireConfig('../../app.config.js') as () => typeof appJson.expo

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

const TestRenderer = require('react-test-renderer')

type TestNode = {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

const mocks = vi.hoisted(() => ({
  expoConfig: null as typeof appJson.expo | null,
  apiClient: vi.fn(),
  openURL: vi.fn(),
  appStateListeners: new Set<(state: AppStateStatus) => void>(),
  showSuccess: vi.fn(),
  isOnline: true,
  renderComposition: false,
  locale: 'en',
  from: undefined as string | undefined,
  hasProAccess: false,
  trialDaysLeft: 5,
  profile: null as ReturnType<typeof createMockProfile> | null,
  plans: {
    monthly: { unitAmount: 999, currency: 'usd' },
    yearly: { unitAmount: 6999, currency: 'usd' },
    savingsPercent: 42, couponPercentOff: null, currency: 'usd',
  } satisfies SubscriptionPlans,
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

const testI18n = createInstance()
void testI18n.init({
  resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } },
  lng: 'en', initAsync: false,
  interpolation: { prefix: '{', suffix: '}' },
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mocks.renderComposition ? testI18n.t : (key: string) => key,
    i18n: { language: mocks.locale },
  }),
}))

vi.mock('expo-constants', () => ({ default: { get expoConfig() { return mocks.expoConfig } } }))

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ from: mocks.from }),
}))

vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>()
  return {
    ...actual,
    AppState: {
      addEventListener: (_event: 'change', listener: (state: AppStateStatus) => void) => {
        mocks.appStateListeners.add(listener)
        return { remove: () => { mocks.appStateListeners.delete(listener) } }
      },
    },
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
vi.mock('@/hooks/use-subscription-plans', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-subscription-plans')>(),
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
}))
vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showSuccess: mocks.showSuccess }),
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
vi.mock('@/components/upgrade/billing-dashboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/upgrade/billing-dashboard')>()
  return { BillingDashboard: (props: React.ComponentProps<typeof actual.BillingDashboard>) =>
    React.createElement(mocks.renderComposition ? actual.BillingDashboard : 'BillingDashboard', props) }
})
vi.mock('@/components/upgrade/play-billing-dashboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/upgrade/play-billing-dashboard')>()
  return { PlayBillingDashboard: (props: React.ComponentProps<typeof actual.PlayBillingDashboard>) =>
    React.createElement(mocks.renderComposition ? actual.PlayBillingDashboard : 'PlayBillingDashboard', props) }
})
vi.mock('@/components/upgrade/pricing-section', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/upgrade/pricing-section')>()
  return { PricingSection: (props: React.ComponentProps<typeof actual.PricingSection>) =>
    React.createElement(mocks.renderComposition ? actual.PricingSection : 'PricingSection', props) }
})

async function renderScreen() {
  let tree: { root: TestNode; unmount: () => void } | undefined
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
    mocks.appStateListeners.clear()
    mocks.openURL.mockReset().mockResolvedValue(undefined)
    mocks.refetchStatus.mockReset().mockResolvedValue(undefined)
    mocks.refetchBilling.mockReset().mockResolvedValue(undefined)
    mocks.isOnline = true
    mocks.renderComposition = false
    mocks.locale = 'en'
    vi.stubEnv('ORBIT_APP_VARIANT', 'production')
    mocks.expoConfig = createConfig()
    mocks.from = undefined
    mocks.hasProAccess = false
    mocks.trialDaysLeft = 5
    mocks.profile = createMockProfile({
      isTrialActive: false,
      subscriptionSource: 'stripe',
    })
    mocks.plans = {
      monthly: { unitAmount: 999, currency: 'usd' },
      yearly: { unitAmount: 6999, currency: 'usd' },
      savingsPercent: 42, couponPercentOff: null, currency: 'usd',
    }
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

  describe.each([
    { locale: 'en', messages: en, trialHeading: '50 a day, or back to 5.' },
    { locale: 'pt-BR', messages: ptBR, trialHeading: '50 ficam, ou 5 por dia.' },
  ] as const)('paywall composition in $locale', ({ locale, messages, trialHeading }) => {
    beforeEach(async () => {
      mocks.renderComposition = true
      mocks.locale = locale
      mocks.billing = undefined
      await testI18n.changeLanguage(locale)
    })

    it.each([4, 1, 0, null])('uses the trial heading with %s days left', async (daysLeft) => {
      mocks.hasProAccess = true
      mocks.profile = createMockProfile({
        isTrialActive: true,
        trialEndsAt: daysLeft === null ? null : new Date(Date.now() + (daysLeft === 0 ? 3600000 : daysLeft * 86400000)).toISOString(),
        aiMessagesLimit: 50,
      })
      const tree = await renderScreen()
      expect(tree.root.findAll((node) => node.type === 'Text' && node.props.accessibilityRole === 'header' && node.props.children === trialHeading)).toHaveLength(1)
      const eyebrow = daysLeft !== null && daysLeft <= 1 ? messages.upgrade.convert.trialLastDay
        : daysLeft === null ? messages.upgrade.convert.trialEyebrow : null
      if (eyebrow) expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === eyebrow)).toHaveLength(1)
      if (daysLeft !== null) {
        const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(mocks.profile.trialEndsAt!))
        const hint = messages.upgrade.billing.plan.trialHint.replace('{date}', date)
        expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === hint)).toHaveLength(1)
      }
      await TestRenderer.act(() => tree.unmount())
    })

    it('keeps the free heading outside a trial', async () => {
      mocks.profile = createMockProfile({ isTrialActive: false, trialEndsAt: null })
      const tree = await renderScreen()
      expect(tree.root.findAll((node) => node.type === 'Text' && node.props.accessibilityRole === 'header' && node.props.children === messages.upgrade.convert.freeHeading)).toHaveLength(1)
      await TestRenderer.act(() => tree.unmount())
    })

    it.each([false, true])('ends the paywall at the decline link without usage, trial=%s', async (isTrialActive) => {
      mocks.hasProAccess = isTrialActive
      mocks.profile = createMockProfile({ isTrialActive, aiMessagesUsed: 45, aiMessagesLimit: 50 })
      const tree = await renderScreen()
      expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === messages.upgrade.convert.stayFree)).toHaveLength(1)
      expect(tree.root.findAll((node) => node.type === 'View' && node.props.accessibilityRole === 'progressbar')).toHaveLength(0)
      expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === messages.upgrade.billing.usage.title)).toHaveLength(0)
      expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === messages.upgrade.billing.usage.nearLimit)).toHaveLength(0)
      await TestRenderer.act(() => tree.unmount())
    })

    it.each(['stripe', 'play', 'lifetime'] as const)('keeps usage on the %s billing dashboard', async (source) => {
      mocks.hasProAccess = true
      mocks.profile = createMockProfile({
        isTrialActive: false, isLifetimePro: source === 'lifetime',
        subscriptionSource: source === 'lifetime' ? null : source,
        aiMessagesUsed: 12, aiMessagesLimit: 50,
      })
      const tree = await renderScreen()
      const meters = tree.root.findAll((node) => node.type === 'View' && node.props.accessibilityRole === 'progressbar' && node.props.accessibilityLabel === messages.upgrade.billing.usage.aiMessages)
      expect(meters).toHaveLength(1)
      expect(meters[0]!.props.accessibilityValue).toEqual({ min: 0, max: 1, now: 0.24 })
      expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === messages.upgrade.billing.usage.aiMessagesOf.replace('{used}', '12').replace('{limit}', '50'))).toHaveLength(1)
      await TestRenderer.act(() => tree.unmount())
    })
  })

  it('shows the pricing section for a free user', async () => {
    const tree = await renderScreen()
    expect(findByType(tree.root, 'PricingSection')).toBeTruthy()
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.accessibilityRole === 'header' && node.props.children === 'upgrade.pitchTitle')).toHaveLength(1)
  })

  it('does not put subscription status in the trial pitch', async () => {
    mocks.hasProAccess = true
    mocks.profile = createMockProfile({
      isTrialActive: true,
      trialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    })

    const tree = await renderScreen()

    expect(tree.root.findAll((node) =>
      node.type === 'Text'
        && node.props.children === 'upgrade.billing.lapsed.title')).toHaveLength(0)
    expect(findByType(tree.root, 'PricingSection')).toBeTruthy()
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.accessibilityRole === 'header' && node.props.children === 'upgrade.pitchTitle')).toHaveLength(1)
  })

  it.each(['stripe', 'play'] as const)('titles the paid %s dashboard as a subscription', async (source) => {
    mocks.hasProAccess = true
    mocks.profile = createMockProfile({ isTrialActive: false, subscriptionSource: source })
    const tree = await renderScreen()
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.accessibilityRole === 'header' && node.props.children === 'upgrade.title')).toHaveLength(1)
  })

  it('titles the lapsed notice as a subscription', async () => {
    mocks.lapseReason = 'expired'
    const tree = await renderScreen()
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.accessibilityRole === 'header' && node.props.children === 'upgrade.title')).toHaveLength(1)
  })

  it.each([
    ['loading', true, false, 'common.loading'],
    ['load-failed', false, true, 'upgrade.billing.error'],
    ['load-failed-without-status', false, false, 'upgrade.billing.error'],
  ] as const)('renders the %s status outcome', async (_state, statusLoading, statusError, label) => {
    mocks.profile = null
    mocks.statusLoading = statusLoading
    mocks.statusError = statusError
    const tree = await renderScreen()
    expect(
      tree.root.findAll((node) => node.props.children === label || node.props.label === label).length,
    ).toBeGreaterThan(0)
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.accessibilityRole === 'header' && node.props.children === (statusLoading ? '' : 'upgrade.title'))).toHaveLength(1)
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
    'renders the %s lapse status in the routed pitch',
    async (lapseReason) => {
      mocks.profile = createMockProfile({
        isTrialActive: false, subscriptionInterval: null, subscriptionSource: null, planExpiresAt: null,
      })
      mocks.lapseReason = lapseReason
      mocks.subscriptionEndedAtUtc = '2026-08-01T00:00:00Z'
      const tree = await renderScreen()
      expect(tree.root.findAll((node) =>
        node.type === 'Text'
          && node.props.accessibilityRole === 'header'
          && node.props.children === 'upgrade.billing.lapsed.title')).toHaveLength(1)
      const endedKey = lapseReason === 'payment_failed' ? 'payment_failed' : 'ended'
      expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === `upgrade.billing.lapsed.${endedKey}`)).toHaveLength(1)
      expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === 'upgrade.billing.lapsed.lostCalendar')).toHaveLength(1)
      expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === 'upgrade.billing.lapsed.lostRetrospective')).toHaveLength(1)
      expect(tree.root.findAll((node) => node.type === 'PricingSection')).toHaveLength(0)
      const action = tree.root.findAll((node) => node.type === 'Pressable' && node.props.testID === 'button-primary-sm')[0]!
      TestRenderer.act(() => { (action.props.onPress as () => void)() })
      expect(findByType(tree.root, 'PricingSection').props.focusOnMount).toBe(true)
    },
  )

  it('renders a truthful payment warning in the routed Pro dashboard', async () => {
    mocks.hasProAccess = true
    mocks.lapseReason = 'payment_failed'
    mocks.subscriptionEndedAtUtc = '2026-08-01T00:00:00Z'
    mocks.billing = { status: 'past_due', cancelAtPeriodEnd: false }

    const tree = await renderScreen()

    expect(findByType(tree.root, 'BillingDashboard').props.state).toBe('past-due')
    expect(findByType(tree.root, 'BillingDashboard')).toBeTruthy()
  })

  it('starts a purchase through the pricing section', async () => {
    const tree = await renderScreen()
    const section = findByType(tree.root, 'PricingSection')
    await TestRenderer.act(async () => {
      ;(section.props.onCheckout as (i: string) => void)('yearly')
      await Promise.resolve()
    })
    expect(mocks.playBilling.clearError).toHaveBeenCalledTimes(1)
    expect(mocks.playBilling.purchase).toHaveBeenCalledWith('yearly')
  })

  it('switches the selected interval', async () => {
    const tree = await renderScreen()
    const section = findByType(tree.root, 'PricingSection')
    await TestRenderer.act(async () => {
      ;(section.props.onSelectInterval as (i: string) => void)('monthly')
      await Promise.resolve()
    })
    expect(findByType(tree.root, 'PricingSection').props.selectedInterval).toBe('monthly')
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
    await TestRenderer.act(async () => {
      ;(section.props.onRestore as () => void)()
      ;(section.props.onRetryPlans as () => void)()
      await Promise.resolve()
    })
    expect(mocks.playBilling.restorePurchases).not.toHaveBeenCalled()
    expect(mocks.refetchPlans).not.toHaveBeenCalled()
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

  it.each([
    ['staging', 'org.useorbit.app.staging'],
    ['production', 'org.useorbit.app'],
  ])('opens the Play management URL for the %s installed app', async (variant, packageName) => {
    vi.stubEnv('ORBIT_APP_VARIANT', variant)
    mocks.expoConfig = createConfig()
    mocks.renderComposition = true
    mocks.hasProAccess = true
    mocks.profile = createMockProfile({
      isTrialActive: false,
      subscriptionSource: 'play',
    })
    mocks.openURL.mockResolvedValue(undefined)
    const tree = await renderScreen()
    const action = tree.root.findAll((node) => node.type === 'Pressable' && node.props.testID === 'button-primary-sm')[0]!
    await TestRenderer.act(async () => {
      ;(action.props.onPress as () => void)()
      await Promise.resolve()
    })
    expect(mocks.openURL).toHaveBeenCalledExactlyOnceWith(
      `https://play.google.com/store/account/subscriptions?sku=orbit_pro&package=${packageName}`,
    )
    await TestRenderer.act(() => tree.unmount())
  })

  it('shows a retry without navigating when the installed app config is missing', async () => {
    mocks.expoConfig = null
    mocks.renderComposition = true
    mocks.hasProAccess = true
    mocks.profile = createMockProfile({ isTrialActive: false, subscriptionSource: 'play' })
    const tree = await renderScreen()
    const action = tree.root.findAll((node) => node.type === 'Pressable' && node.props.testID === 'button-primary-sm')[0]!
    await TestRenderer.act(() => { (action.props.onPress as () => void)() })
    expect(mocks.openURL).not.toHaveBeenCalled()
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === testI18n.t('upgrade.billing.portalFailed'))).toHaveLength(1)
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === testI18n.t('upgrade.billing.retry'))).toHaveLength(1)
    await TestRenderer.act(() => tree.unmount())
  })

  it.each(['stripe', 'play'] as const)('recovers the %s foreground return before the link promise settles and refreshes once', async (source) => {
    mocks.hasProAccess = true
    mocks.profile = createMockProfile({ isTrialActive: false, subscriptionSource: source })
    mocks.apiClient.mockResolvedValue({ url: 'https://billing.test/portal' })
    let resolveLink: () => void = () => {}
    let resolveRefresh: () => void = () => {}
    mocks.openURL.mockReturnValue(new Promise<void>((resolve) => { resolveLink = resolve }))
    mocks.refetchStatus.mockReturnValue(new Promise<void>((resolve) => { resolveRefresh = resolve }))
    const tree = await renderScreen()
    const dashboardType = source === 'play' ? 'PlayBillingDashboard' : 'BillingDashboard'
    const dashboard = () => findByType(tree.root, dashboardType)
    const state = () => source === 'play' ? dashboard().props.portalState : dashboard().props.state
    const emit = (nextState: AppStateStatus) => {
      TestRenderer.act(() => { mocks.appStateListeners.forEach((listener) => listener(nextState)) })
    }
    emit('active')
    expect(mocks.refetchStatus).not.toHaveBeenCalled()
    await TestRenderer.act(async () => {
      ;(dashboard().props[source === 'play' ? 'onManagePlay' : 'onPortal'] as () => void)()
      await Promise.resolve()
    })
    expect(mocks.openURL).toHaveBeenCalledTimes(1)
    expect(state()).toBe(source === 'play' ? 'opening' : 'portal-opening')
    emit('background')
    expect(mocks.refetchStatus).not.toHaveBeenCalled()
    emit('active')
    expect(state()).toBe(source === 'play' ? 'idle' : 'stripe')
    emit('active')
    expect(mocks.refetchStatus).toHaveBeenCalledTimes(1)
    expect(mocks.refetchBilling).toHaveBeenCalledTimes(1)
    await TestRenderer.act(async () => { resolveLink(); resolveRefresh(); await Promise.resolve() })
    emit('background')
    emit('active')
    expect(mocks.refetchStatus).toHaveBeenCalledTimes(1)
    expect(mocks.showSuccess).toHaveBeenCalledTimes(1)
    await TestRenderer.act(() => tree.unmount())
    expect(mocks.appStateListeners.size).toBe(0)
  })

  it.each(['stripe', 'play'] as const)('keeps the %s handoff failure on foreground return and allows retry', async (source) => {
    mocks.hasProAccess = true
    mocks.profile = createMockProfile({ isTrialActive: false, subscriptionSource: source })
    mocks.apiClient.mockResolvedValue({ url: 'https://billing.test/portal' })
    mocks.openURL.mockRejectedValueOnce(new Error('unavailable'))
    const tree = await renderScreen()
    const dashboard = () => findByType(tree.root, source === 'play' ? 'PlayBillingDashboard' : 'BillingDashboard')
    const manage = () => (dashboard().props[source === 'play' ? 'onManagePlay' : 'onPortal'] as () => void)()
    await TestRenderer.act(async () => { manage(); await Promise.resolve() })
    await TestRenderer.act(() => { mocks.appStateListeners.forEach((listener) => listener('active')) })
    expect(source === 'play' ? dashboard().props.portalState : dashboard().props.state)
      .toBe(source === 'play' ? 'failed' : 'portal-failed')
    expect(mocks.refetchStatus).not.toHaveBeenCalled()
    expect(mocks.refetchBilling).not.toHaveBeenCalled()
    await TestRenderer.act(async () => { manage(); await Promise.resolve() })
    await TestRenderer.act(() => { mocks.appStateListeners.forEach((listener) => listener('active')) })
    expect(source === 'play' ? dashboard().props.portalState : dashboard().props.state)
      .toBe(source === 'play' ? 'idle' : 'stripe')
    expect(mocks.refetchStatus).toHaveBeenCalledTimes(1)
    await TestRenderer.act(() => tree.unmount())
  })

  it('clears the pending checkout once play billing stops processing', async () => {
    let tree: { root: TestNode; update: (element: React.ReactElement) => void } | undefined
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<UpgradeScreen />)
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      ;(findByType(tree!.root, 'PricingSection').props.onCheckout as (i: string) => void)('monthly')
      await Promise.resolve()
    })
    expect(findByType(tree!.root, 'PricingSection').props.checkoutLoading).toBe('monthly')

    mocks.playBilling.isProcessing = true
    await TestRenderer.act(() => {
      tree!.update(<UpgradeScreen />)
    })
    expect(findByType(tree!.root, 'PricingSection').props.checkoutLoading).toBe('monthly')

    mocks.playBilling.isProcessing = false
    await TestRenderer.act(() => {
      tree!.update(<UpgradeScreen />)
    })
    expect(findByType(tree!.root, 'PricingSection').props.checkoutLoading).toBeNull()
  })
})
