import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Easing, ReduceMotion } from 'react-native-reanimated'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import { PlanSelection } from '@/components/upgrade/plan-selection'
import type { SubscriptionInterval, UpgradeTextFn } from '@/components/upgrade/types'
import type { PlayOffer } from '@/hooks/use-play-billing'
import { formatPrice, monthlyEquivalent } from '@/hooks/use-subscription-plans'
import { createTokensV2 } from '@/lib/theme'

const motionMocks = vi.hoisted(() => ({
  reduced: false,
  fadeInDuration: vi.fn(),
  fadeOutDuration: vi.fn(),
}))

vi.mock('@/lib/motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/motion')>()
  return {
    ...actual,
    usePrefersReducedMotion: () => motionMocks.reduced,
  }
})

vi.mock('react-native-reanimated', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native-reanimated')>()
  function builder(durationV: number) {
    return {
      durationV,
      easingV: undefined as unknown,
      reduceMotionV: actual.ReduceMotion.System,
      easing(easing: unknown) {
        this.easingV = easing
        return this
      },
      reduceMotion(mode: ReduceMotion) {
        this.reduceMotionV = mode
        return this
      },
    }
  }
  return {
    ...actual,
    Easing: { ...actual.Easing, bezier: vi.fn(actual.Easing.bezier) },
    FadeIn: {
      duration: (duration: number) => {
        motionMocks.fadeInDuration(duration)
        return builder(duration)
      },
    },
    FadeOut: {
      duration: (duration: number) => {
        motionMocks.fadeOutDuration(duration)
        return builder(duration)
      },
    },
  }
})

vi.mock('@/hooks/use-subscription-plans', () => ({
  useSubscriptionPlans: () => ({}),
  formatPrice: (amount: number, currency: string) => `${currency} ${(amount / 100).toFixed(2)}`,
  monthlyEquivalent: (amount: number) => Math.round(amount / 12),
}))

const TestRenderer = require('react-test-renderer')

const t: UpgradeTextFn = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key)
const tokens = createTokensV2('purple', 'dark')

function visibleJson(tree: { toJSON: () => unknown }) {
  return JSON.stringify(tree.toJSON(), (_key, value: unknown) => {
    if (value && typeof value === 'object' && 'props' in value) {
      const props = value.props as Record<string, unknown>
      if (props.importantForAccessibility === 'no-hide-descendants') return null
    }
    return value
  })
}

interface NativeNode {
  props: Record<string, unknown>
  parent?: NativeNode | null
}

function isVisible(node: NativeNode): boolean {
  return node.props.importantForAccessibility !== 'no-hide-descendants'
    && (!node.parent || isVisible(node.parent))
}
const plans: SubscriptionPlans = {
  monthly: { unitAmount: 999, currency: 'usd' },
  yearly: { unitAmount: 4999, currency: 'usd' },
  savingsPercent: 58,
  couponPercentOff: null,
  currency: 'usd',
}

function offer(interval: SubscriptionInterval, isReferral: boolean): PlayOffer {
  const plan = interval === 'monthly' ? plans.monthly : plans.yearly
  return {
    interval,
    sku: `sku-${interval}`,
    offerToken: `offer-${interval}`,
    displayPrice: formatPrice(plan.unitAmount, plan.currency),
    isReferral,
    priceAmountMicros: null,
    currency: plan.currency,
  }
}

function renderSelection(
  selectedInterval: SubscriptionInterval = 'yearly',
  overrides: Partial<React.ComponentProps<typeof PlanSelection>> = {},
) {
  const props: React.ComponentProps<typeof PlanSelection> = {
    plans,
    isLoading: false,
    isError: false,
    isOnline: true,
    monthlyOffer: null,
    yearlyOffer: null,
    selectedInterval,
    checkoutLoading: null,
    checkoutError: '',
    checkoutDisabled: false,
    onSelectInterval: () => {},
    onCheckout: () => {},
    onRetry: () => {},
    t,
    tokens,
    ...overrides,
  }
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(<PlanSelection {...props} />)
  })
  tree.rerender = (nextOverrides: Partial<React.ComponentProps<typeof PlanSelection>>) => {
    TestRenderer.act(() => {
      tree.update(<PlanSelection {...props} {...nextOverrides} />)
    })
  }
  return tree
}

describe('PlanSelection (mobile)', () => {
  beforeEach(() => {
    motionMocks.reduced = false
    motionMocks.fadeInDuration.mockClear()
    motionMocks.fadeOutDuration.mockClear()
    vi.mocked(Easing.bezier).mockClear()
  })

  it('leads with annual and gives it the only filled action', () => {
    const tree = renderSelection()
    const tiers = tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) =>
      isVisible(node) && node.type === 'View' && typeof node.props.testID === 'string'
        && node.props.testID.startsWith('upgrade-tier-'))

    expect(tiers.map((tier: { props: { testID: string } }) => tier.props.testID)).toEqual([
      'upgrade-tier-yearly',
      'upgrade-tier-monthly',
    ])
    expect(visibleJson(tree).match(/upgrade\.plans\.recommended/g)).toHaveLength(1)
    expect(tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) =>
      isVisible(node) && node.type === 'Pressable' && node.props.testID === 'button-primary-md')).toHaveLength(1)
    expect(tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) =>
      isVisible(node) && node.type === 'Pressable' && node.props.testID === 'button-ghost-md')).toHaveLength(1)
    expect(visibleJson(tree)).toContain(
      formatPrice(plans.yearly.unitAmount, plans.currency),
    )
  })

  it('selects monthly separately without starting checkout', () => {
    const onSelectInterval = vi.fn()
    const onCheckout = vi.fn()
    const tree = renderSelection('yearly', { onSelectInterval, onCheckout })

    const monthlySegment = tree.root.findAllByType('Pressable')[0]
    TestRenderer.act(() => monthlySegment.props.onPress())
    expect(onSelectInterval).toHaveBeenCalledWith('monthly')
    expect(onCheckout).not.toHaveBeenCalled()
  })

  it('softens the loading-to-content swap', () => {
    const tree = renderSelection('yearly', { plans: null, isLoading: true })
    expect(motionMocks.fadeOutDuration).toHaveBeenCalledWith(165)

    tree.rerender({ plans, isLoading: false })

    expect(motionMocks.fadeInDuration).toHaveBeenCalledWith(220)
    const motion = tree.root.findByProps({
      testID: 'upgrade-motion-preventing-a-jarring-change',
    })
    expect(motion.props.entering).toBeDefined()
  })

  it('hard-cuts loading-to-content with reduced motion', () => {
    motionMocks.reduced = true
    const tree = renderSelection('yearly', { plans: null, isLoading: true })

    tree.rerender({ plans, isLoading: false })

    expect(motionMocks.fadeInDuration).not.toHaveBeenCalled()
    expect(motionMocks.fadeOutDuration).not.toHaveBeenCalled()
  })

  it('animates error-to-loaded with the shared entrance and exit curves', () => {
    const tree = renderSelection('yearly', { plans: null, isError: true })
    const failedMotion = tree.root.findByType('AnimatedView')
    expect(failedMotion.props.entering).toBeUndefined()
    const exiting = failedMotion.props.exiting
    expect(Easing.bezier).toHaveBeenLastCalledWith(...motionEasings.exit)
    expect(exiting).toEqual(expect.objectContaining({
      durationV: motionDurations.routeExit,
      easingV: vi.mocked(Easing.bezier).mock.results.at(-1)!.value,
      reduceMotionV: ReduceMotion.System,
    }))

    vi.mocked(Easing.bezier).mockClear()
    tree.rerender({ plans, isError: false })
    const loadedMotion = tree.root.findByType('AnimatedView')

    expect(loadedMotion).not.toBe(failedMotion)
    expect(Easing.bezier).toHaveBeenCalledWith(...motionEasings.enter)
    const entranceCall = vi.mocked(Easing.bezier).mock.calls.findIndex((points) =>
      points.every((point, index) => point === motionEasings.enter[index]))
    expect(loadedMotion.props.entering).toEqual(expect.objectContaining({
      durationV: motionDurations.base,
      easingV: vi.mocked(Easing.bezier).mock.results[entranceCall]!.value,
      reduceMotionV: ReduceMotion.System,
    }))
    expect(loadedMotion.props.exiting).toBeDefined()
    tree.rerender({ plans, isError: false, selectedInterval: 'monthly' })
    expect(tree.root.findByType('AnimatedView')).toBe(loadedMotion)
  })

  it('hard-cuts error-to-loaded with reduced motion', () => {
    motionMocks.reduced = true
    const tree = renderSelection('yearly', { plans: null, isError: true })
    expect(tree.root.findByType('AnimatedView').props.exiting).toBeUndefined()

    tree.rerender({ plans, isError: false })

    const motion = tree.root.findByType('AnimatedView')
    expect(motion.props.entering).toBeUndefined()
    expect(motion.props.exiting).toBeUndefined()
    expect(Easing.bezier).not.toHaveBeenCalled()
  })

  it.each(['yearly', 'monthly'] as const)(
    'keeps annual recommended while %s is selected',
    (selectedInterval) => {
      const tree = renderSelection(selectedInterval)
      const annualTier = tree.root.findByProps({ testID: 'upgrade-content-yearly' }).findByProps({ testID: 'upgrade-tier-yearly' })
      const monthlyTier = tree.root.findByProps({ testID: 'upgrade-content-monthly' }).findByProps({ testID: 'upgrade-tier-monthly' })

      expect(annualTier.findAll((node: { props: { children?: unknown } }) =>
        node.props.children === 'upgrade.plans.recommended').length).toBeGreaterThan(0)
      expect(monthlyTier.findAll((node: { props: { children?: unknown } }) =>
        node.props.children === 'upgrade.plans.recommended')).toHaveLength(0)
      expect(annualTier.findByType('Pressable').props.accessibilityLabel).toBe(
        t('upgrade.plans.checkoutLabelRecommended', { interval: 'upgrade.plans.yearly.name' }),
      )
      expect(monthlyTier.findByType('Pressable').props.accessibilityLabel).toBe(
        t('upgrade.plans.checkoutLabel', { interval: 'upgrade.plans.monthly.name' }),
      )
      const selectedTier = selectedInterval === 'yearly' ? annualTier : monthlyTier
      const unselectedTier = selectedInterval === 'yearly' ? monthlyTier : annualTier
      expect(selectedTier.findByProps({ testID: 'button-primary-md' })).toBeTruthy()
      expect(unselectedTier.findByProps({ testID: 'button-ghost-md' })).toBeTruthy()
    },
  )

  it('renders annual arithmetic from the payload', () => {
    const tree = renderSelection()
    const rendered = visibleJson(tree)

    expect(rendered).toContain(`upgrade.plans.yearly.equivalent`)
    expect(rendered).toContain(formatPrice(monthlyEquivalent(plans.yearly.unitAmount), plans.currency))
    expect(rendered).toContain(String(plans.savingsPercent))
  })

  it('shows coupon copy only for Play offers that apply it', () => {
    const couponPercentOff = 23
    const oneReferralOffer = renderSelection('yearly', {
      plans: { ...plans, couponPercentOff },
      monthlyOffer: offer('monthly', true),
      yearlyOffer: offer('yearly', false),
    })
    const withCoupon = visibleJson(oneReferralOffer)
    expect(withCoupon.match(/upgrade\.plans\.coupon\.line/g)).toHaveLength(1)
    expect(withCoupon).toContain(String(couponPercentOff))
    const annualTier = oneReferralOffer.root.findByProps({ testID: 'upgrade-content-yearly' }).findByProps({ testID: 'upgrade-tier-yearly' })
    expect(annualTier.findAll((node: { props: { children?: unknown } }) =>
      String(node.props.children).includes('upgrade.plans.coupon.line'))).toHaveLength(0)

    const withoutCoupon = visibleJson(renderSelection())
    expect(withoutCoupon).not.toContain('upgrade.plans.coupon.line')
  })

  it('owns loading and retry states for the price tiers', () => {
    const onRetry = vi.fn()
    const loading = renderSelection('yearly', { plans: null, isLoading: true })
    expect(loading.root.findAll(
      (node: { type: unknown; props: Record<string, unknown> }) =>
        node.type === 'View' && node.props.testID === 'skeleton-unit-settings',
    )).toHaveLength(6)

    const loadingWrapper = loading.root.findAll(
      (node: { type: unknown; props: Record<string, unknown> }) =>
        node.type === 'View' && node.props.accessibilityLabel === 'upgrade.plans.loading'
          && node.props.accessibilityRole !== 'progressbar',
    )
    expect(loadingWrapper).toHaveLength(0)
    expect(loading.root.findAll(
      (node: { type: unknown; props: Record<string, unknown> }) =>
        node.type === 'View' && node.props.accessibilityRole === 'progressbar'
          && node.props.accessibilityLabel === 'upgrade.plans.loading'
          && node.props.accessible === true,
    )).toHaveLength(6)

    const failed = renderSelection('yearly', {
      plans: null,
      isLoading: false,
      isError: true,
      onRetry,
    })
    const retry = failed.root.findAll(
      (node: { type: unknown; props: Record<string, unknown> }) =>
        node.type === 'Pressable' && node.props.accessibilityRole === 'button',
    )[0]
    TestRenderer.act(() => retry.props.onPress())
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('checks out from either tier with the same CTA verb', () => {
    const onCheckout = vi.fn()
    const tree = renderSelection('yearly', { onCheckout })
    const actions = tree.root.findAll(
      (node: { type: unknown; props: Record<string, unknown> }) =>
        isVisible(node) && node.type === 'Pressable' && String(node.props.testID).startsWith('button-'),
    )

    expect(actions.map((action: { props: { accessibilityLabel?: string } }) =>
      action.props.accessibilityLabel)).toEqual([
      `upgrade.plans.checkoutLabelRecommended:${JSON.stringify({ interval: 'upgrade.plans.yearly.name' })}`,
      `upgrade.plans.checkoutLabel:${JSON.stringify({ interval: 'upgrade.plans.monthly.name' })}`,
    ])
    TestRenderer.act(() => actions[0].props.onPress())
    TestRenderer.act(() => actions[1].props.onPress())
    expect(onCheckout).toHaveBeenNthCalledWith(1, 'yearly')
    expect(onCheckout).toHaveBeenNthCalledWith(2, 'monthly')
    expect(visibleJson(tree).match(/upgrade\.plans\.cta/g)).toHaveLength(2)
  })

  it('locks paid actions during checkout', () => {
    const tree = renderSelection('yearly', {
      checkoutLoading: 'yearly',
    })
    const buttons = tree.root.findAllByType('Pressable').filter(isVisible)

    expect(buttons.filter((button: { props: { disabled?: boolean } }) => button.props.disabled)).toHaveLength(4)
  })

  it.each(['yearly', 'monthly'] as const)('keeps %s loading and loaded reservations equal to the measured card', (interval) => {
    const tree = renderSelection(interval, { plans: null, isLoading: true })
    const measurement = () => tree.root.findByProps({ testID: `upgrade-measurement-${interval}` })
    const reservation = () => tree.root.findByProps({ testID: `upgrade-reservation-${interval}` })
    const measure = (height: number) => TestRenderer.act(() => {
      measurement().props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 380, height } } })
    })
    measure(317)
    expect(reservation().props.style.minHeight).toBe(317)
    expect(measurement().props.importantForAccessibility).toBe('no-hide-descendants')
    expect(measurement().props.pointerEvents).toBe('none')
    expect(tree.root.findAllByType('Pressable').filter(isVisible)).toHaveLength(2)

    tree.rerender({ plans: { ...plans, couponPercentOff: 23 }, isLoading: false,
      monthlyOffer: offer('monthly', true), yearlyOffer: offer('yearly', true) })
    measure(317)
    expect(reservation().props.style.minHeight).toBe(317)
    const content = tree.root.findByProps({ testID: `upgrade-content-${interval}` })
    expect(content.props.style.minHeight).toBe(317)
    measure(389)
    expect(reservation().props.style.minHeight).toBe(389)
    TestRenderer.act(() => content.props.onLayout({
      nativeEvent: { layout: { x: 0, y: 0, width: 380, height: 421 } },
    }))
    expect(reservation().props.style.minHeight).toBe(421)
  })

  it('announces checkout failures', () => {
    const tree = renderSelection()
    const alert = tree.root.findByProps({ accessibilityRole: 'alert' })
    expect(alert.props.children).toBe('')
    expect(alert.props.accessibilityLiveRegion).toBe('assertive')

    tree.rerender({ checkoutError: 'purchase failed' })
    expect(tree.root.findByProps({ accessibilityRole: 'alert' })).toBe(alert)
    expect(alert.props.children).toBe('purchase failed')
    expect(alert.props.accessibilityLiveRegion).toBe('assertive')

    tree.rerender({ checkoutError: '' })
    expect(tree.root.findByProps({ accessibilityRole: 'alert' })).toBe(alert)
    expect(alert.props.children).toBe('')
  })
})
