import React from 'react'
import { View } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { enableTestFlags, resetTestFlags } from '@orbit/shared/test-support/flag-state'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import type { BillingDetails, SubscriptionPlans } from '@orbit/shared/types/subscription'
import { renderedText } from '@/__tests__/support/react-test-renderer'
import UpgradeScreen from '@/app/upgrade'
import { press, renderNavigation } from '../components/ui/navigation-render'
import { __setWindowDimensions } from '@/test-mocks/react-native'

type StoreOfferDouble = { displayPrice: string; isReferral: boolean }

interface UpgradeMocks {
  locale: 'en' | 'pt-BR'
  from: string | undefined
  router: { push: ReturnType<typeof vi.fn>; replace: ReturnType<typeof vi.fn> }
  goBack: ReturnType<typeof vi.fn>
  showSuccess: ReturnType<typeof vi.fn>
  status: SubscriptionStatus | null
  timeZone: string | null
  plans: SubscriptionPlans | null
  billing: BillingDetails | undefined
  plansLoading: boolean
  plansError: boolean
  online: boolean
  reducedMotion: boolean
  refetchPlans: ReturnType<typeof vi.fn>
  onPurchased: (() => void) | undefined
  playBilling: Record<string, unknown> & { purchase: ReturnType<typeof vi.fn>; yearlyOffer: StoreOfferDouble; monthlyOffer: StoreOfferDouble }
}

const mocks = vi.hoisted((): UpgradeMocks => ({
  locale: 'en',
  from: undefined,
  router: { push: vi.fn(), replace: vi.fn() },
  goBack: vi.fn(),
  showSuccess: vi.fn(),
  status: null,
  timeZone: 'America/Sao_Paulo',
  plans: null,
  billing: undefined,
  plansLoading: false,
  plansError: false,
  online: true,
  reducedMotion: false,
  refetchPlans: vi.fn(() => Promise.resolve()),
  onPurchased: undefined,
  playBilling: {
    isLoadingProducts: false, isProductsError: false, retryProducts: vi.fn(), isProcessing: false, errorKey: '', clearError: vi.fn(),
    purchase: vi.fn(() => Promise.resolve()), restorePurchases: vi.fn(() => Promise.resolve()),
    yearlyOffer: { displayPrice: 'R$99', isReferral: false },
    monthlyOffer: { displayPrice: 'R$12', isReferral: false },
    isReferralPricing: false, isRestoring: false,
  },
}))

vi.mock('react-i18next', async () => {
  const { testI18n } = await import('@/__tests__/support/i18n')
  return { useTranslation: () => ({ t: testI18n.getFixedT(mocks.locale), i18n: { language: mocks.locale } }) }
})
vi.mock('expo-constants', () => ({ default: { expoConfig: { android: { package: 'org.useorbit.app' } } } }))
vi.mock('expo-router', () => ({ useLocalSearchParams: () => ({ from: mocks.from }), useRouter: () => mocks.router }))
vi.mock('expo-iap', async (importOriginal) => ({ ...await importOriginal<typeof import('expo-iap')>(), showManageSubscriptionsIOS: vi.fn() }))
vi.mock('react-native-safe-area-context', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-native-safe-area-context')>(),
  SafeAreaView: (props: React.ComponentProps<typeof View>) => <View {...props} />,
}))
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => mocks.reducedMotion }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => mocks.goBack }))
vi.mock('@/hooks/use-back-label', () => ({ useBackLabel: () => 'Back' }))
vi.mock('@/hooks/use-billing', () => ({ useBilling: () => ({ billing: mocks.billing, isLoading: false, isError: false, refetch: vi.fn(() => Promise.resolve()) }) }))
vi.mock('@/hooks/store-billing-provider', () => ({
  useStoreBilling: (options: { onPurchased?: () => void }) => {
    mocks.onPurchased = options.onPurchased
    return mocks.playBilling
  },
}))
vi.mock('@/hooks/use-subscription-plans', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-subscription-plans')>(),
  useSubscriptionPlans: () => ({ plans: mocks.plans, isLoading: mocks.plansLoading, isError: mocks.plansError, refetch: mocks.refetchPlans }),
}))
vi.mock('@/hooks/use-subscription-status', () => ({
  useSubscriptionStatus: () => ({ status: mocks.status, isLoading: false, isError: false, refetch: vi.fn(() => Promise.resolve()) }),
}))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: mocks.timeZone } }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showSuccess: mocks.showSuccess }) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))


const freeStatus: SubscriptionStatus = {
  plan: 'free', hasProAccess: false, isTrialActive: false, trialEndsAt: null, planExpiresAt: null,
  aiMessagesUsed: 3, aiMessagesLimit: 5, aiMessagesPeriod: 'day', isLifetimePro: false,
  subscriptionInterval: null, source: null, lapseReason: null, subscriptionEndedAtUtc: null,
}
const proStatus: SubscriptionStatus = {
  ...freeStatus, plan: 'pro', hasProAccess: true, planExpiresAt: '2026-10-01T01:30:00Z', aiMessagesLimit: 250,
  aiMessagesPeriod: 'week', subscriptionInterval: 'yearly', source: 'play',
}
const plans: SubscriptionPlans = {
  monthly: { unitAmount: 999, currency: 'usd' }, yearly: { unitAmount: 6999, currency: 'usd' },
  savingsPercent: 42, couponPercentOff: null, currency: 'usd',
}

type Tree = ReturnType<typeof renderNavigation>
type Host = ReturnType<Tree['hosts']>[number]

const byTestId = (tree: Tree, testID: string) => tree.hosts().find((node) => node.props.testID === testID)
const byLabel = (tree: Tree, label: string) => tree.hosts().find((node) => node.props.accessibilityLabel === label && node.props.onPress !== undefined)
const headers = (tree: Tree) => tree.hosts().filter((node) => node.props.accessibilityRole === 'header')
/** The states of the live mascots on screen. The small static face of a list icon is not a live mascot. */
const orbitStates = (tree: Tree) => tree.hosts().map((node) => node.props as Record<string, unknown>).filter((props) => props['data-orbit-face'] === 'rig').map((props) => props['data-orbit-state'])
const screenText = (tree: Tree) => tree.hosts().filter((node) => node.type === 'Text').map((node) => renderedText(node)).join('\n')
const hint = (node: Host) => (node.props as Record<string, unknown>).accessibilityHint

function confirmPurchase() {
  void require('react-test-renderer').act(() => { mocks.onPurchased?.() })
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(mocks, { locale: 'en', from: undefined, status: freeStatus, timeZone: 'America/Sao_Paulo', plans, billing: undefined, plansLoading: false, plansError: false, online: true, reducedMotion: false })
  Object.assign(mocks.playBilling, { isProcessing: false, isRestoring: false, errorKey: '', isLoadingProducts: false, isProductsError: false })
  enableTestFlags('orbit_guided_flows')
  __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 })
})

describe('the plan question of the Android upgrade route', () => {
  it.each([
    ['en', 'Which plan?', 'You used 3 of 5 AI messages.'],
    ['pt-BR', 'Qual plano?', 'Você usou 3 de 5 mensagens de IA.'],
  ] as const)('shows Orbit in Parado, the usage line, the question as the one header of the block and two plan options in %s', (locale, question, line) => {
    mocks.locale = locale
    const tree = renderNavigation(<UpgradeScreen />)
    const block = byTestId(tree, 'upgrade-block')!
    expect(block).toBeDefined()
    const questionHeader = headers(tree).find((node) => renderedText(node) === question)!
    expect(hint(questionHeader)).toBe(line)
    expect(renderedText(byTestId(tree, 'upgrade-orbit-line'))).toBe(line)
    expect(headers(tree).some((node) => renderedText(node) === 'Orbit Pro')).toBe(false)
    expect(orbitStates(tree)).toEqual(['parado'])
    expect(byTestId(tree, 'upgrade-plan-option-yearly')!.props.accessibilityState).toMatchObject({ selected: true })
    expect(byTestId(tree, 'upgrade-plan-option-monthly')!.props.accessibilityState).toMatchObject({ selected: false })
    tree.unmount()
  })

  it.each([[412, 96], [1024, 128]] as const)('draws Orbit at the size of the shell (%i wide: %i)', (width, size) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
    const tree = renderNavigation(<UpgradeScreen />)
    const rigs = tree.hosts().map((node) => node.props as Record<string, unknown>).filter((props) => props['data-orbit-face'] === 'rig')
    expect(rigs.map((props) => props.width)).toEqual([size])
    tree.unmount()
  })

  it.each([['en', 'You used 1 of 1 AI message.'], ['pt-BR', 'Você usou 1 de 1 mensagem de IA.']] as const)('writes a limit of one message in the singular in %s', (locale, line) => {
    mocks.locale = locale
    mocks.status = { ...freeStatus, aiMessagesUsed: 1, aiMessagesLimit: 1 }
    const tree = renderNavigation(<UpgradeScreen />)
    expect(renderedText(byTestId(tree, 'upgrade-orbit-line'))).toBe(line)
    tree.unmount()
  })

  it('follows the usage read when it changes', () => {
    const tree = renderNavigation(<UpgradeScreen />)
    mocks.status = { ...freeStatus, aiMessagesUsed: 5 }
    tree.update(<UpgradeScreen />)
    expect(renderedText(byTestId(tree, 'upgrade-orbit-line'))).toBe('You used 5 of 5 AI messages.')
    expect(orbitStates(tree)).toEqual(['parado'])
    tree.unmount()
  })

  it('selects the pressed plan and starts the Play purchase for that plan only', () => {
    const tree = renderNavigation(<UpgradeScreen />)
    press(byTestId(tree, 'upgrade-plan-option-monthly')!)
    expect(byTestId(tree, 'upgrade-plan-option-monthly')!.props.accessibilityState).toMatchObject({ selected: true })
    expect(byTestId(tree, 'upgrade-plan-option-yearly')!.props.accessibilityState).toMatchObject({ selected: false })
    press(byLabel(tree, 'Subscribe Monthly')!)
    expect(mocks.playBilling.purchase).toHaveBeenCalledTimes(1)
    expect(mocks.playBilling.purchase).toHaveBeenCalledWith('monthly')
    tree.unmount()
  })

  it('shows the price of each plan from the store offer and the equivalent from the plans read', () => {
    const tree = renderNavigation(<UpgradeScreen />)
    expect(renderedText(byTestId(tree, 'upgrade-plan-option-yearly'))).toContain('R$99')
    expect(renderedText(byTestId(tree, 'upgrade-plan-option-yearly'))).toContain('42% less than monthly')
    expect(renderedText(byTestId(tree, 'upgrade-plan-option-monthly'))).toContain('R$12')
    tree.unmount()
  })

  it('shows the coupon line on the plan card that the store offer marks', () => {
    mocks.plans = { ...plans, couponPercentOff: 20 }
    mocks.playBilling.yearlyOffer = { displayPrice: 'R$79', isReferral: true }
    const tree = renderNavigation(<UpgradeScreen />)
    expect(renderedText(byTestId(tree, 'upgrade-plan-option-yearly'))).toContain('With your coupon, 20% off the first charge.')
    expect(renderedText(byTestId(tree, 'upgrade-plan-option-monthly'))).not.toContain('coupon')
    mocks.playBilling.yearlyOffer = { displayPrice: 'R$99', isReferral: false }
    tree.unmount()
  })

  it('keeps the allowance comparison, the plan fact, the Pro list, restore, the notes and the stay free action', () => {
    const tree = renderNavigation(<UpgradeScreen />)
    const support = renderedText(byTestId(tree, 'upgrade-support'))
    for (const text of ['You are on the free plan', 'No lock-in, and no card is ever stored in Orbit.', '5', 'messages/day', '250', 'messages/week',
      'Included with Pro', 'Restore purchase', 'Cancel whenever you like.']) expect(support).toContain(text)
    press(tree.hosts().find((node) => node.props.accessibilityRole === 'link' && renderedText(node) === 'Stay on the free plan')!)
    expect(mocks.goBack).toHaveBeenCalledWith('/profile')
    tree.unmount()
  })

  it('shows the trial line with the days left, and the last day variant on the last day', () => {
    mocks.status = { ...freeStatus, plan: 'pro', hasProAccess: true, isTrialActive: true, trialEndsAt: '2026-09-15T12:00:00Z' }
    vi.setSystemTime(new Date('2026-09-12T09:00:00Z'))
    const tree = renderNavigation(<UpgradeScreen />)
    expect(renderedText(byTestId(tree, 'upgrade-support'))).toMatch(/trial days left/)
    tree.unmount()
    vi.setSystemTime(new Date('2026-09-15T09:00:00Z'))
    const lastDay = renderNavigation(<UpgradeScreen />)
    expect(renderedText(byTestId(lastDay, 'upgrade-support'))).toContain('Last day of the trial')
    lastDay.unmount()
    vi.useRealTimers()
  })

  it('names the loading state and shows a skeleton, with no plan to start', () => {
    mocks.plans = null
    mocks.plansLoading = true
    const tree = renderNavigation(<UpgradeScreen />)
    expect(renderedText(byTestId(tree, 'upgrade-orbit-line'))).toBe('I am fetching the amounts.')
    expect(byTestId(tree, 'upgrade-plan-options-loading')).toBeDefined()
    press(byLabel(tree, 'Subscribe Annual, recommended')!)
    expect(mocks.playBilling.purchase).not.toHaveBeenCalled()
    tree.unmount()
  })

  it('names the plans error and reads the plans again on retry', () => {
    mocks.plans = null
    mocks.plansError = true
    const tree = renderNavigation(<UpgradeScreen />)
    expect(renderedText(byTestId(tree, 'upgrade-orbit-line'))).toBe('I could not fetch the amounts.')
    press(byLabel(tree, 'Try again')!)
    expect(mocks.refetchPlans).toHaveBeenCalledTimes(1)
    tree.unmount()
  })

  it('refuses the purchase offline with a visible reason', () => {
    mocks.online = false
    const tree = renderNavigation(<UpgradeScreen />)
    expect(renderedText(byTestId(tree, 'upgrade-orbit-line'))).toBe('I am offline right now.')
    expect(renderedText(byTestId(tree, 'upgrade-offline-reason'))).not.toBe('')
    press(byLabel(tree, 'Subscribe Annual, recommended')!)
    expect(mocks.playBilling.purchase).not.toHaveBeenCalled()
    tree.unmount()
  })

  it('starts one purchase for a double press', () => {
    const tree = renderNavigation(<UpgradeScreen />)
    press(byLabel(tree, 'Subscribe Annual, recommended')!)
    const waiting = tree.hosts().find((node) => node.props.accessibilityLabel === 'Subscribe Annual, recommended')!
    expect(waiting.props.accessibilityState).toMatchObject({ busy: true })
    press(waiting)
    expect(mocks.playBilling.purchase).toHaveBeenCalledTimes(1)
    expect(mocks.playBilling.purchase).toHaveBeenCalledWith('yearly')
    tree.unmount()
  })

  it.each([false, true])('settles the selection ring with reduced motion %s', (reducedMotion) => {
    mocks.reducedMotion = reducedMotion
    const tree = renderNavigation(<UpgradeScreen />)
    const style = JSON.stringify(byTestId(tree, 'upgrade-plan-option-monthly')!.props.style)
    expect(style.includes('"transition":"none"')).toBe(reducedMotion)
    tree.unmount()
  })
})

describe('the result of an Android purchase', () => {
  it('opens no dialog before the store confirms, and no dialog for a confirmation that the subscription read does not report', () => {
    const tree = renderNavigation(<UpgradeScreen />)
    expect(byTestId(tree, 'result-dialog')).toBeUndefined()
    confirmPurchase()
    expect(byTestId(tree, 'result-dialog')).toBeUndefined()
    expect(mocks.showSuccess).not.toHaveBeenCalled()
    tree.unmount()
  })

  it('keeps the plan question and the error of a purchase that fails, with no dialog', () => {
    mocks.playBilling.errorKey = 'upgrade.appStore.error.unavailable'
    const tree = renderNavigation(<UpgradeScreen />)
    expect(screenText(tree)).toContain('App Store purchases are unavailable. Please try again.')
    expect(byTestId(tree, 'upgrade-block')).toBeDefined()
    expect(byTestId(tree, 'result-dialog')).toBeUndefined()
    tree.unmount()
  })

  it('opens no dialog when the read reports Pro and no purchase was confirmed', () => {
    mocks.status = proStatus
    const tree = renderNavigation(<UpgradeScreen />)
    expect(byTestId(tree, 'result-dialog')).toBeUndefined()
    tree.unmount()
  })

  it('states the renewal date of the record in the account time zone and opens Hoje', () => {
    const tree = renderNavigation(<UpgradeScreen />)
    confirmPurchase()
    mocks.status = proStatus
    tree.update(<UpgradeScreen />)
    const dialog = byTestId(tree, 'result-dialog')!
    expect(dialog.props.accessibilityLabel).toBe('Done!')
    expect(hint(dialog)).toBe('Pro is active and renews on September 30, 2026.')
    press(byLabel(tree, 'Open Today') ?? tree.hosts().find((node) => node.props.onPress !== undefined && renderedText(node) === 'Open Today')!)
    expect(mocks.router.replace).toHaveBeenCalledWith('/(tabs)')
    expect(byTestId(tree, 'result-dialog')).toBeUndefined()
    tree.unmount()
  })

  it('states the end date for a subscription that does not renew, in pt-BR', () => {
    mocks.locale = 'pt-BR'
    const tree = renderNavigation(<UpgradeScreen />)
    confirmPurchase()
    mocks.status = { ...proStatus, lapseReason: 'canceled' }
    tree.update(<UpgradeScreen />)
    expect(hint(byTestId(tree, 'result-dialog')!)).toBe('O Pro está ativo até 30 de setembro de 2026.')
    tree.unmount()
  })

  it('returns the person to the place that the from of the visit names', () => {
    mocks.from = '/profile/ai'
    const tree = renderNavigation(<UpgradeScreen />)
    confirmPurchase()
    mocks.status = proStatus
    tree.update(<UpgradeScreen />)
    press(tree.hosts().find((node) => node.props.onPress !== undefined && renderedText(node) === 'Go back' && node.props.testID?.startsWith('button-'))!)
    expect(mocks.goBack).toHaveBeenCalledWith('/profile/ai')
    expect(mocks.router.replace).not.toHaveBeenCalled()
    tree.unmount()
  })

  it('closes on a scrim press and stays on the subscription route', () => {
    const tree = renderNavigation(<UpgradeScreen />)
    confirmPurchase()
    mocks.status = proStatus
    tree.update(<UpgradeScreen />)
    press(byTestId(tree, 'result-dialog-scrim')!)
    expect(byTestId(tree, 'result-dialog')).toBeUndefined()
    expect(mocks.router.replace).not.toHaveBeenCalled()
    tree.unmount()
  })
})

describe('the dashboards and the notices of the Android route with the guided flows on', () => {
  const billing: BillingDetails = {
    interval: 'yearly', cancelAtPeriodEnd: false, status: 'active', currentPeriodEnd: '2026-10-01T01:30:00Z', amountPerPeriod: 11880, currency: 'brl',
    paymentMethod: { brand: 'visa', last4: '4242', expMonth: 12, expYear: 2028 },
    recentInvoices: [{ id: 'invoice-1', date: '2026-09-01T12:00:00Z', amountPaid: 11880, currency: 'brl', status: 'paid', hostedInvoiceUrl: null, invoicePdf: 'https://invoices.example/invoice-1.pdf', billingReason: 'subscription_cycle' }],
  }

  it('keeps every read and every provider action of the Stripe dashboard, with the usage of the person and no plan question', () => {
    mocks.status = { ...proStatus, source: 'stripe', aiMessagesUsed: 40 }
    mocks.billing = billing
    const tree = renderNavigation(<UpgradeScreen />)
    const text = screenText(tree)
    expect(text).toContain('Visa ending in 4242')
    expect(text).toContain('Expires 12/2028')
    expect(text).toContain('Renewal')
    expect(text).toContain('40 of 250')
    expect(text).toContain('Open the Stripe portal')
    expect(tree.hosts().some((node) => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Download the invoice from') && node.props.onPress !== undefined)).toBe(true)
    expect(byTestId(tree, 'upgrade-block')).toBeUndefined()
    expect(orbitStates(tree)).not.toContain('feliz')
    tree.unmount()
  })

  it('keeps the Google Play note and its provider action', () => {
    mocks.status = { ...proStatus, billingProvider: 'play' }
    const tree = renderNavigation(<UpgradeScreen />)
    const text = screenText(tree)
    expect(text).toContain('You subscribed through Google Play')
    expect(text).toContain('Open Google Play')
    expect(text).not.toContain('Open the Stripe portal')
    expect(byTestId(tree, 'upgrade-block')).toBeUndefined()
    tree.unmount()
  })

  it('keeps the App Store note with no purchase action on Android', () => {
    mocks.status = { ...proStatus, source: null, billingProvider: 'app_store' }
    const tree = renderNavigation(<UpgradeScreen />)
    const text = screenText(tree)
    expect(text).toContain('To change or cancel this App Store subscription, manage it on your iPhone.')
    expect(text).not.toContain('Open the Stripe portal')
    expect(byTestId(tree, 'upgrade-block')).toBeUndefined()
    tree.unmount()
  })

  it('opens the plan question from the action of the lapsed notice', () => {
    mocks.status = { ...freeStatus, lapseReason: 'payment_failed', subscriptionEndedAtUtc: '2026-09-01T12:00:00Z' }
    const tree = renderNavigation(<UpgradeScreen />)
    expect(byTestId(tree, 'subscription-notice')).toBeDefined()
    expect(screenText(tree)).toContain('Your Pro has ended')
    expect(screenText(tree)).toContain('Update your payment method with the provider.')
    expect(orbitStates(tree)).toEqual(['parado'])
    press(tree.hosts().find((node) => node.props.onPress !== undefined && renderedText(node) === 'Subscribe again')!)
    expect(byTestId(tree, 'subscription-notice')).toBeUndefined()
    expect(headers(tree).some((node) => renderedText(node) === 'Which plan?')).toBe(true)
    tree.unmount()
  })
})

describe('the Android upgrade route with the guided flows off', () => {
  it('keeps the current pitch, the title of the header as a header and the done toast of a verified purchase', () => {
    resetTestFlags()
    const tree = renderNavigation(<UpgradeScreen />)
    expect(headers(tree).some((node) => renderedText(node) === 'Orbit Pro')).toBe(true)
    expect(byTestId(tree, 'upgrade-block')).toBeUndefined()
    expect(byTestId(tree, 'upgrade-orbit-line')).toBeUndefined()
    confirmPurchase()
    expect(mocks.showSuccess).toHaveBeenCalledTimes(1)
    expect(byTestId(tree, 'result-dialog')).toBeUndefined()
    tree.unmount()
  })
})
