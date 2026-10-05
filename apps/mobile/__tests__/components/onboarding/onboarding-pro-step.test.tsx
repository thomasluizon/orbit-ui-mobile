import { Resvg } from '@resvg/resvg-js'
import { ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { __setWindowDimensions, __resetTestHostConfig } from '../../../test-mocks/react-native'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import React from 'react'
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

vi.mock('@/components/onboarding/onboarding-actions-context', () => ({
  useOnboardingActions: () => ({ finishOnboarding: vi.fn(async () => {}) }),
  useOnboardingIsLive: () => true,
}))
vi.mock('@/lib/queued-api-mutation', () => ({ performQueuedApiMutation: vi.fn() }))
vi.mock('@/components/onboarding/onboarding-welcome', () => ({ OnboardingWelcome: () => null }))
vi.mock('@/components/onboarding/onboarding-create-habit', () => ({ OnboardingCreateHabit: () => null }))
vi.mock('@/components/onboarding/onboarding-remind', () => ({ OnboardingRemind: () => null }))
vi.mock('expo-router', () => ({ useRouter: () => ({ navigate: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/hooks/use-habit-suggestion', () => ({ useHabitSuggestion: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-push-notifications', () => ({ usePushNotifications: () => ({ isSupported: false }) }))

afterEach(__resetTestHostConfig)

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

const font = require.resolve('@expo-google-fonts/space-grotesk/500Medium/SpaceGrotesk_500Medium.ttf')
const geometryCases = [320, 360, 384, 412, 640, 1440].flatMap((width) => ['pt-BR', 'en']
  .flatMap((locale) => [false, true].map((trial) => ({ width, locale, trial }))))
it.each(geometryCases)('fits the owning Android final-step heading at $width in $locale, trial=$trial', async ({ width, locale, trial }) => {
  __setWindowDimensions({ width, height: 1400, scale: 1, fontScale: 1 })
  mocks.locale = locale
  mocks.profile = createMockProfile({ hasProAccess: trial, isTrialActive: trial, plan: trial ? 'pro' : 'free', trialEndsAt: trial ? new Date(Date.now() + 7 * 86400000).toISOString() : null })
  mocks.refetch.mockResolvedValue({ data: mocks.profile, isError: false })
  let tree!: ReturnType<typeof TestRenderer.create>
  await act(() => { tree = TestRenderer.create(<OnboardingFlow finalStepOnly />) })
  try {
    const text = translate(trial ? 'onboarding.flow.trial.title' : 'upgrade.convert.freeHeading')
    const heading = tree.root.findAll((node) => node.type === Text && node.props.accessibilityRole === 'header' && node.props.children === text)[0]!
    expect(heading).toBeDefined()
    const style = StyleSheet.flatten(heading.props.style as StyleProp<TextStyle>)
    let measure = width
    for (let ancestor = Reflect.get(heading, 'parent') as ReactTestInstance | null; ancestor; ancestor = Reflect.get(ancestor, 'parent') as ReactTestInstance | null) {
      if (ancestor.type !== View && ancestor.type !== ScrollView) continue
      const ancestorStyle = StyleSheet.flatten((ancestor.type === ScrollView ? ancestor.props.contentContainerStyle : ancestor.props.style) as StyleProp<ViewStyle>)
      measure = Math.min(measure, Number(ancestorStyle.maxWidth ?? measure)) - Number(ancestorStyle.paddingHorizontal ?? 0) * 2
    }
    expect(heading.props.numberOfLines).toBeUndefined()
    expect(heading.props.ellipsizeMode).toBeUndefined()
    expect(heading.props.adjustsFontSizeToFit).not.toBe(true)
    expect(heading.props.allowFontScaling).not.toBe(false)
    expect(style.fontSize).toBe(width < 640 ? 28 : 34)
    expect(style.fontFamily).toBe('SpaceGrotesk_500Medium')
    expect(style.letterSpacing).toBeCloseTo(-0.02 * style.fontSize!)
    const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="100"><text y="50" font-family="Space Grotesk" font-size="${style.fontSize}" letter-spacing="${style.letterSpacing}">${escaped}</text></svg>`
    const bounds = new Resvg(svg, { font: { fontFiles: [font], loadSystemFonts: false } }).getBBox()!
    process.stdout.write(`${JSON.stringify({ width, locale, trial, measure, textWidth: bounds.x + bounds.width })}\n`)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(measure)
    expect(measure).toBe(Math.min(width, width >= 1024 ? 560 : 440) - 32)
  } finally { await act(() => tree.update(<></>)) }
})
