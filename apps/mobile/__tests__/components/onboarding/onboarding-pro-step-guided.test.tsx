import React from 'react'
import { View } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import { renderedText } from '@/__tests__/support/react-test-renderer'
import { OnboardingProStep } from '@/components/onboarding/onboarding-pro-step'
import { press, renderNavigation } from '../ui/navigation-render'

const plans: SubscriptionPlans = { monthly: { unitAmount: 999, currency: 'usd' }, yearly: { unitAmount: 6999, currency: 'usd' }, savingsPercent: 42, currency: 'usd', couponPercentOff: null }

interface ProStepMocks {
  plan: 'Free' | 'Trial' | 'loading' | null
  retry: ReturnType<typeof vi.fn>
  profile: ReturnType<typeof createMockProfile> | undefined
  online: boolean
  purchase: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted((): ProStepMocks => ({ plan: 'Free', retry: vi.fn(), profile: undefined, online: true, purchase: vi.fn(() => Promise.resolve(true)) }))

vi.mock('react-i18next', async () => {
  const { testI18n } = await import('@/__tests__/support/i18n')
  return { useTranslation: () => ({ t: testI18n.getFixedT('en'), i18n: { language: 'en' } }) }
})
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-onboarding-plan', () => ({ useOnboardingPlan: () => ({ plan: mocks.plan, profile: mocks.profile, retry: mocks.retry }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showSuccess: vi.fn() }) }))
vi.mock('@/hooks/use-subscription-plans', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-subscription-plans')>()),
  useSubscriptionPlans: () => ({ plans, isLoading: false, isError: false, refetch: vi.fn() }),
}))
vi.mock('@/hooks/store-billing-provider', () => ({
  useStoreBilling: () => ({
    purchase: mocks.purchase, isProcessing: false, errorKey: null, clearError: vi.fn(), monthlyOffer: null, yearlyOffer: null,
    isRestoring: false, restorePurchases: vi.fn(), isLoadingProducts: false, isProductsError: false, retryProducts: vi.fn(),
  }),
}))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))

type Tree = ReturnType<typeof renderNavigation>
const byTestId = (tree: Tree, testID: string) => tree.hosts().find((node) => node.props.testID === testID)
const byLabel = (tree: Tree, label: string) => tree.hosts().find((node) => node.props.accessibilityLabel === label && node.props.onPress !== undefined)
const orbitStates = (tree: Tree) => tree.hosts().map((node) => node.props as Record<string, unknown>).filter((props) => props['data-orbit-face'] === 'rig').map((props) => props['data-orbit-state'])
const screenText = (tree: Tree) => tree.hosts().filter((node) => node.type === 'Text').map((node) => renderedText(node)).join('\n')
const headers = (tree: Tree) => tree.hosts().filter((node) => node.props.accessibilityRole === 'header').map((node) => renderedText(node))

async function settle() {
  await require('react-test-renderer').act(async () => { await Promise.resolve() })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.plan = 'Free'
  mocks.online = true
  mocks.retry = vi.fn()
  mocks.profile = createMockProfile({ plan: 'free', hasProAccess: false, isTrialActive: false, aiMessagesUsed: 2, aiMessagesLimit: 5 })
})

describe('the Android onboarding Pro step', () => {
  it('asks the plan question with the flag on, with the usage line and the plan options', () => {
    enableTestFlags('orbit_guided_flows')
    const tree = renderNavigation(<OnboardingProStep onFinish={vi.fn(async () => {})} />)
    expect(headers(tree)).toContain('Which plan?')
    expect(headers(tree)).not.toContain('Orbit Pro')
    expect(renderedText(byTestId(tree, 'upgrade-orbit-line'))).toBe('You used 2 of 5 AI messages.')
    expect(byTestId(tree, 'upgrade-plan-option-yearly')).toBeDefined()
    expect(byTestId(tree, 'upgrade-plan-option-monthly')).toBeDefined()
    const rigs = tree.hosts().map((node) => node.props as Record<string, unknown>).filter((props) => props['data-orbit-face'] === 'rig')
    expect(rigs.map((props) => props['data-orbit-state'])).toEqual(['parado'])
    tree.unmount()
  })

  it('hands the pinned plan footer to the host frame apart from the body, with the flag on', async () => {
    enableTestFlags('orbit_guided_flows')
    const frame = (body: React.ReactNode, footer: React.ReactNode) => <><View testID="frame-body">{body}</View><View testID="frame-footer">{footer}</View></>
    const tree = renderNavigation(<OnboardingProStep onFinish={vi.fn(async () => {})} frame={frame} />)
    const body = byTestId(tree, 'frame-body')!
    const footer = byTestId(tree, 'frame-footer')!
    expect(body.findAll((node) => node.props.testID === 'upgrade-block').length).toBeGreaterThan(0)
    expect(body.findAll((node) => node.props.accessibilityLabel === 'Subscribe Annual, recommended')).toHaveLength(0)
    const primary = footer.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === 'Subscribe Annual, recommended' && node.props.onPress !== undefined)
    expect(primary).toHaveLength(1)
    press(primary[0]!)
    await settle()
    expect(mocks.purchase).toHaveBeenCalledExactlyOnceWith('yearly')
    tree.unmount()
  })

  it('starts the purchase of the selected plan and completes onboarding on the stay free exit, with the flag on', async () => {
    enableTestFlags('orbit_guided_flows')
    const onFinish = vi.fn(async () => {})
    const tree = renderNavigation(<OnboardingProStep onFinish={onFinish} />)
    press(byTestId(tree, 'upgrade-plan-option-monthly')!)
    press(byLabel(tree, 'Subscribe Monthly')!)
    await settle()
    expect(mocks.purchase).toHaveBeenCalledWith('monthly')
    press(tree.hosts().find((node) => node.props.accessibilityRole === 'link' && renderedText(node) === 'Stay on the free plan')!)
    await settle()
    expect(onFinish).toHaveBeenCalledTimes(1)
    tree.unmount()
  })

  it('keeps the see my day exit of a trial person, with the flag on', async () => {
    enableTestFlags('orbit_guided_flows')
    mocks.plan = 'Trial'
    mocks.profile = createMockProfile({ plan: 'pro', hasProAccess: true, isTrialActive: true, trialEndsAt: '2099-01-01T00:00:00Z' })
    const onFinish = vi.fn(async () => {})
    const tree = renderNavigation(<OnboardingProStep onFinish={onFinish} />)
    expect(byTestId(tree, 'onboarding-orbit')).toBeDefined()
    expect(orbitStates(tree)).toEqual(['parado'])
    expect(headers(tree)).toContain('Orbit Pro is on')
    expect(screenText(tree)).toMatch(/Your trial ends \w{3} \d{1,2}, \d{4}/)
    press(tree.hosts().find((node) => node.props.onPress !== undefined && renderedText(node) === 'See day')!)
    await settle()
    expect(onFinish).toHaveBeenCalledTimes(1)
    tree.unmount()
  })

  it('refuses the purchase offline with the reason, with the flag on', async () => {
    enableTestFlags('orbit_guided_flows')
    mocks.online = false
    const tree = renderNavigation(<OnboardingProStep onFinish={vi.fn(async () => {})} />)
    expect(renderedText(byTestId(tree, 'upgrade-orbit-line'))).toBe('I am offline right now.')
    expect(byTestId(tree, 'upgrade-offline-reason')).toBeDefined()
    press(byLabel(tree, 'Subscribe Annual, recommended')!)
    await settle()
    expect(mocks.purchase).not.toHaveBeenCalled()
    tree.unmount()
  })

  it('shows Orbit in Parado over the skeleton while the plan loads, with no pitch heading and the see my day exit, with the flag on', () => {
    enableTestFlags('orbit_guided_flows')
    mocks.plan = 'loading'
    const tree = renderNavigation(<OnboardingProStep onFinish={vi.fn(async () => {})} />)
    const busy = tree.hosts().find((node) => (node.props.accessibilityState as { busy?: boolean } | undefined)?.busy === true)!
    expect(busy.props.accessibilityLabel).toBe('Loading...')
    expect(orbitStates(tree)).toEqual(['parado'])
    expect(headers(tree)).not.toContain('Orbit Pro')
    expect(tree.hosts().some((node) => node.props.onPress !== undefined && renderedText(node) === 'See day')).toBe(true)
    tree.unmount()
  })

  it('lets Orbit name the plan read error and reads the plan again on retry, with the flag on', () => {
    enableTestFlags('orbit_guided_flows')
    mocks.plan = null
    const tree = renderNavigation(<OnboardingProStep onFinish={vi.fn(async () => {})} />)
    expect(orbitStates(tree)).toEqual(['parado'])
    expect(screenText(tree)).toContain('I could not load your plan.')
    expect(headers(tree)).not.toContain('Orbit Pro')
    press(byLabel(tree, 'Try again')!)
    expect(mocks.retry).toHaveBeenCalledTimes(1)
    tree.unmount()
  })

  it.each(['loading', null, 'Trial'] as const)('keeps the current %s state with no Orbit with the flag off', (plan) => {
    mocks.plan = plan
    if (plan === 'Trial') mocks.profile = createMockProfile({ plan: 'pro', hasProAccess: true, isTrialActive: true, trialEndsAt: '2099-01-01T00:00:00Z' })
    const tree = renderNavigation(<OnboardingProStep onFinish={vi.fn(async () => {})} />)
    expect(byTestId(tree, 'onboarding-orbit')).toBeUndefined()
    expect(orbitStates(tree)).toEqual([])
    expect(headers(tree)).toContain(plan === 'Trial' ? 'Orbit Pro is on' : 'Orbit Pro')
    tree.unmount()
  })

  it('renders the current paywall with the flag off', () => {
    const tree = renderNavigation(<OnboardingProStep onFinish={vi.fn(async () => {})} />)
    expect(headers(tree)).toContain('Orbit Pro')
    expect(byTestId(tree, 'upgrade-block')).toBeUndefined()
    expect(byTestId(tree, 'upgrade-tier-yearly')).toBeDefined()
    expect(byLabel(tree, 'Subscribe Annual, recommended')).toBeDefined()
    tree.unmount()
  })
})
