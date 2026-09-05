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
      node.type === 'View' && typeof node.props.testID === 'string'
        && node.props.testID.startsWith('upgrade-tier-'))

    expect(tiers.map((tier: { props: { testID: string } }) => tier.props.testID)).toEqual([
      'upgrade-tier-yearly',
      'upgrade-tier-monthly',
    ])
    expect(JSON.stringify(tree.toJSON()).match(/upgrade\.plans\.recommended/g)).toHaveLength(1)
    expect(tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) =>
      node.type === 'Pressable' && node.props.testID === 'button-primary-md')).toHaveLength(1)
    expect(tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) =>
      node.type === 'Pressable' && node.props.testID === 'button-ghost-md')).toHaveLength(1)
    expect(JSON.stringify(tree.toJSON())).toContain(
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
      const annualTier = tree.root.findByProps({ testID: 'upgrade-tier-yearly' })
      const monthlyTier = tree.root.findByProps({ testID: 'upgrade-tier-monthly' })

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
    const rendered = JSON.stringify(tree.toJSON())

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
    const withCoupon = JSON.stringify(oneReferralOffer.toJSON())
    expect(withCoupon.match(/upgrade\.plans\.coupon\.line/g)).toHaveLength(1)
    expect(withCoupon).toContain(String(couponPercentOff))
    const annualTier = oneReferralOffer.root.findByProps({ testID: 'upgrade-tier-yearly' })
    expect(annualTier.findAll((node: { props: { children?: unknown } }) =>
      String(node.props.children).includes('upgrade.plans.coupon.line'))).toHaveLength(0)

    const withoutCoupon = JSON.stringify(renderSelection().toJSON())
    expect(withoutCoupon).not.toContain('upgrade.plans.coupon.line')
  })

  it('owns loading and retry states for the price tiers', () => {
    const onRetry = vi.fn()
    const loading = renderSelection('yearly', { plans: null, isLoading: true })
    expect(loading.root.findAll(
      (node: { type: unknown; props: Record<string, unknown> }) =>
        node.type === 'View' && node.props.testID === 'skeleton-unit-settings',
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
        node.type === 'Pressable' && String(node.props.testID).startsWith('button-'),
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
    expect(JSON.stringify(tree.toJSON()).match(/upgrade\.plans\.cta/g)).toHaveLength(2)
  })

  it('locks paid actions during checkout', () => {
    const tree = renderSelection('yearly', {
      checkoutLoading: 'yearly',
    })
    const buttons = tree.root.findAllByType('Pressable')

    expect(buttons.filter((button: { props: { disabled?: boolean } }) => button.props.disabled)).toHaveLength(4)
  })

  it('announces checkout failures', () => {
    const tree = renderSelection('yearly', { checkoutError: 'purchase failed' })
    const error = tree.root.findByProps({ children: 'purchase failed' })

    expect(error.props.accessibilityRole).toBe('alert')
    expect(error.props.accessibilityLiveRegion).toBe('polite')
  })
})
