import React from 'react'
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { getTrialDaysLeft } from '@orbit/shared/utils'
import { plural } from '@/lib/plural'
import { setAccountId } from '@/lib/account-scope'
import { OnboardingProStep, type OnboardingProExit } from '@/components/onboarding/onboarding-pro-step'

const plans: SubscriptionPlans = { monthly: { unitAmount: 999, currency: 'usd' }, yearly: { unitAmount: 6999, currency: 'usd' }, savingsPercent: 42, currency: 'usd', couponPercentOff: null }
const mocks = vi.hoisted(() => ({
  profile: undefined as ReturnType<typeof createMockProfile> | undefined,
  refetch: vi.fn(), online: true, locale: 'en', plansState: 'loaded', processing: false,
  errorKey: null as string | null, onPurchased: undefined as (() => Promise<void>) | undefined,
  purchase: vi.fn(), showSuccess: vi.fn(),
}))
function translate(key: string, parameters?: Record<string, unknown>): string {
  let value: unknown = mocks.locale === 'pt-BR' ? ptBr : en
  for (const part of key.split('.')) value = Reflect.get(value as object, part)
  let message = String(value)
  for (const [name, parameter] of Object.entries(parameters ?? {})) message = message.replaceAll(`{${name}}`, String(parameter))
  return message
}
vi.mock('@/lib/i18n', () => ({ i18n: { language: 'en' } }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: translate, i18n: { language: mocks.locale } }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profile, refetch: mocks.refetch }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showSuccess: mocks.showSuccess }) }))
vi.mock('@/hooks/use-subscription-plans', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-subscription-plans')>()),
  useSubscriptionPlans: () => ({ plans: mocks.plansState === 'loaded' ? plans : null, isLoading: mocks.plansState === 'loading', isError: mocks.plansState === 'error', refetch: vi.fn() }),
}))
vi.mock('@/hooks/use-play-billing', () => ({ usePlayBilling: (options: { onPurchased: () => Promise<void> }) => {
  mocks.onPurchased = options.onPurchased
  return { purchase: mocks.purchase, isProcessing: mocks.processing, errorKey: mocks.errorKey, clearError: vi.fn(), monthlyOffer: null, yearlyOffer: null, isRestoring: false, restorePurchases: vi.fn() }
} }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }) }))
vi.mock('@/components/ui/pill-button', () => ({ PillButton: (props: Record<string, unknown>) => React.createElement('PillButton', props) }))

beforeEach(async () => {
  vi.clearAllMocks()
  vi.spyOn(AsyncStorage, 'setItem')
  await AsyncStorage.clear()
  setAccountId('account-1')
  mocks.profile = createMockProfile({ isTrialActive: false, hasProAccess: false, plan: 'free', trialEndsAt: null })
  mocks.refetch.mockResolvedValue({ data: mocks.profile, isError: false })
  mocks.online = true; mocks.locale = 'en'; mocks.plansState = 'loaded'; mocks.processing = false; mocks.errorKey = null
})
function all(root: ReactTestInstance, type: string) { return root.findAll((node) => node.type === type) }
function text(root: ReactTestInstance): unknown[] { return all(root, 'Text').map((node) => node.props.children) }
function callback(node: ReactTestInstance, name: string): () => void | Promise<void> { return Reflect.get(node.props, name) as () => void | Promise<void> }
function action(root: ReactTestInstance, label: string): ReactTestInstance {
  const element = root.findAll((node) => (node.props.children === label || text(node).includes(label)) && (String(node.type) === 'PillButton' || node.props.accessibilityRole === 'link'))[0]
  expect(element).toBeDefined()
  return element!
}
async function mount() {
  const finish = vi.fn(() => Promise.resolve())
  const exit = React.createRef<OnboardingProExit>()
  let tree!: ReturnType<typeof TestRenderer.create>
  await act(async () => { tree = TestRenderer.create(<OnboardingProStep onFinish={finish} ref={exit} />); await Promise.resolve() })
  return { tree, finish, exit }
}

describe('Android final Pro step', () => {
  it.each(['en', 'pt-BR'])('keeps both loaded paywall card hooks and outcomes in %s', async (locale) => {
    mocks.locale = locale
    const { tree } = await mount()
    const step = tree.root.findAll((node) => String(node.type) === 'View' && node.props.testID === 'onboarding-step-paywall')[0]!
    const cards = step.findAll((node) => String(node.type) === 'View' && /^upgrade-tier-(yearly|monthly)$/.test(String(node.props.testID)))
    expect(cards.map((card) => card.props.testID)).toEqual(['upgrade-tier-yearly', 'upgrade-tier-monthly'])
    const outcomes = step.findAll((node) => String(node.type) === 'View' && node.props.accessibilityLabel === translate('upgrade.outcomes.label'))
    expect(outcomes).toHaveLength(2)
    for (const card of cards) {
      expect(all(card, 'PillButton')).toHaveLength(1)
      expect(all(card, 'PillButton')[0]!.props.disabled).toBe(false)
      const list = card.findAll((node) => String(node.type) === 'View' && node.props.accessibilityLabel === translate('upgrade.outcomes.label'))[0]!
      for (const key of ['astra', 'calendar', 'retrospective', 'noticing']) {
        expect(text(list).filter((value) => value === translate(`upgrade.outcomes.${key}`))).toHaveLength(1)
      }
    }
  })

  it.each(['en', 'pt-BR'])('shows the running trial and one action in %s', async (locale) => {
    mocks.locale = locale
    mocks.profile = createMockProfile({ isTrialActive: true, hasProAccess: true, plan: 'pro', trialEndsAt: new Date(Date.now() + 7 * 86400000).toISOString() })
    mocks.refetch.mockResolvedValue({ data: mocks.profile, isError: false })
    const { tree, finish } = await mount()
    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'onboarding-step-trial')).toHaveLength(1)
    expect(text(tree.root)).toContain(plural(translate('upgrade.convert.trialDaysLeft', { days: getTrialDaysLeft(mocks.profile) }), getTrialDaysLeft(mocks.profile)!))
    const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(mocks.profile.trialEndsAt!))
    expect(text(tree.root)).toContain(translate('upgrade.billing.plan.trialHint', { date }))
    expect(text(tree.root)).toContain('5'); expect(text(tree.root)).toContain('50')
    expect(all(tree.root, 'PillButton')).toHaveLength(1)
    await act(() => callback(action(tree.root, translate('onboarding.flow.done.seeDay')), 'onClick')())
    expect(finish).toHaveBeenCalledOnce()
  })

  it.each(['loading', 'error', 'offline', 'loaded'])('leaves the free plan step while plans are %s', async (state) => {
    mocks.plansState = state === 'offline' ? 'loaded' : state; mocks.online = state !== 'offline'
    const { tree, finish } = await mount()
    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'onboarding-step-paywall')).toHaveLength(1)
    if (state === 'loaded') {
      const outcomes = tree.root.findAll((node) => String(node.type) === 'View' && node.props.accessibilityLabel === translate('upgrade.outcomes.label'))
      expect(outcomes).toHaveLength(2)
      for (const interval of ['yearly', 'monthly']) {
        const tier = tree.root.findAll((node) => String(node.type) === 'View' && node.props.testID === `upgrade-tier-${interval}`)[0]!
        for (const key of ['astra', 'calendar', 'retrospective', 'noticing']) {
          expect(text(tier)).toContain(translate(`upgrade.outcomes.${key}`))
        }
      }
    }
    const decline = action(tree.root, en.upgrade.convert.stayFree)
    expect(decline.props.disabled).toBe(false)
    if (state === 'offline') expect(all(tree.root, 'PillButton').every((button) => button.props.disabled)).toBe(true)
    await act(() => callback(decline, 'onPress')())
    expect(finish).toHaveBeenCalledOnce()
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('orbit_trial_expired_seen:account-1', '1')
  })

  it.each([false, true])('finishes paid Pro without a pitch, lifetime=%s', async (lifetime) => {
    mocks.refetch.mockResolvedValue({ data: createMockProfile({ hasProAccess: !lifetime, isLifetimePro: lifetime, isTrialActive: false }), isError: false })
    const { tree, finish } = await mount()
    expect(finish).toHaveBeenCalledOnce()
    expect(tree.root.findAll((node) => String(node.props.testID).startsWith('onboarding-step-'))).toHaveLength(0)
  })

  it('keeps a missing profile on the error surface with exit', async () => {
    mocks.profile = undefined; mocks.refetch.mockResolvedValue({ data: undefined, isError: true })
    const { tree, finish } = await mount()
    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'onboarding-step-paywall')).toHaveLength(0)
    expect(text(tree.root)).toContain(en.upgrade.billing.error)
    await act(() => callback(action(tree.root, en.onboarding.flow.done.seeDay), 'onClick')())
    expect(finish).toHaveBeenCalledOnce()
  })

  it('uses the free plan returned when the trial ended', async () => {
    mocks.profile = createMockProfile({ isTrialActive: true, hasProAccess: true, trialEndsAt: new Date(Date.now() - 86400000).toISOString() })
    const { tree } = await mount()
    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'onboarding-step-paywall')).toHaveLength(1)
  })

  it('leaves a cancelled purchase open without an error', async () => {
    const { tree, finish } = await mount()
    await act(async () => callback(all(tree.root, 'PillButton').find((node) => node.props.children === en.upgrade.plans.cta && !node.props.disabled)!, 'onClick')())
    expect(mocks.purchase).toHaveBeenCalledOnce()
    expect(finish).not.toHaveBeenCalled()
    expect(mocks.showSuccess).not.toHaveBeenCalled()
  })

  it('finishes and shows the done toast after the billing refresh callback', async () => {
    const { finish } = await mount()
    await act(async () => mocks.onPurchased?.())
    expect(finish).toHaveBeenCalledOnce()
    expect(mocks.showSuccess).toHaveBeenCalledWith(en.upgrade.purchaseSuccess)
  })

  it('blocks the back exit and decline during a purchase', async () => {
    mocks.processing = true
    const { tree, exit, finish } = await mount()
    expect(action(tree.root, en.upgrade.convert.stayFree).props.disabled).toBe(true)
    await act(() => exit.current?.exit())
    expect(finish).not.toHaveBeenCalled()
  })
})
