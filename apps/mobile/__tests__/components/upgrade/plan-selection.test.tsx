import { describe, expect, it, vi } from 'vitest'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import { PlanSelection } from '@/components/upgrade/plan-selection'
import type { SubscriptionInterval, UpgradeTextFn } from '@/components/upgrade/types'
import { formatPrice, monthlyEquivalent } from '@/hooks/use-subscription-plans'
import { createTokensV2 } from '@/lib/theme'

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

function renderSelection(
  selectedInterval: SubscriptionInterval = 'yearly',
  overrides: Partial<React.ComponentProps<typeof PlanSelection>> = {},
) {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <PlanSelection
        plans={plans}
        isLoading={false}
        isError={false}
        isOnline
        yearlyOffer={null}
        selectedInterval={selectedInterval}
        checkoutLoading={null}
        checkoutError=""
        checkoutDisabled={false}
        onSelectInterval={() => {}}
        onCheckout={() => {}}
        onRetry={() => {}}
        t={t}
        tokens={tokens}
        {...overrides}
      />,
    )
  })
  return tree
}

describe('PlanSelection (mobile)', () => {
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

  it('renders annual arithmetic from the payload', () => {
    const tree = renderSelection()
    const rendered = JSON.stringify(tree.toJSON())

    expect(rendered).toContain(`upgrade.plans.yearly.equivalent`)
    expect(rendered).toContain(formatPrice(monthlyEquivalent(plans.yearly.unitAmount), plans.currency))
    expect(rendered).toContain(String(plans.savingsPercent))
  })

  it('shows the payload coupon on both tiers only when it exists', () => {
    const couponPercentOff = 23
    const withCoupon = JSON.stringify(renderSelection('yearly', {
      plans: { ...plans, couponPercentOff },
    }).toJSON())
    expect(withCoupon.match(/upgrade\.plans\.coupon\.line/g)).toHaveLength(2)
    expect(withCoupon).toContain(String(couponPercentOff))

    const withoutCoupon = JSON.stringify(renderSelection().toJSON())
    expect(withoutCoupon).not.toContain('upgrade.plans.coupon.line')
  })

  it('owns loading and retry states for the price tiers', () => {
    const onRetry = vi.fn()
    const loading = renderSelection('yearly', { plans: null, isLoading: true })
    expect(JSON.stringify(loading.toJSON()).match(/upgrade\.plans\.loading/g)!.length).toBeGreaterThan(1)

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
      `upgrade.plans.checkoutLabel:${JSON.stringify({ interval: 'upgrade.plans.yearly.name' })}`,
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
