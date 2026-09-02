import { describe, expect, it, vi } from 'vitest'
import { createTokensV2 } from '@/lib/theme'
import { PlanSelection } from '@/components/upgrade/plan-selection'
import type { SubscriptionInterval, UpgradeTextFn } from '@/components/upgrade/types'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import { formatPrice } from '@/hooks/use-subscription-plans'

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
        onSelectInterval={() => {}}
        onStayFree={() => {}}
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
  it('preselects the yearly plan card', () => {
    const tree = renderSelection('yearly')
    const pressables = tree.root.findAllByType('Pressable')
    expect(pressables).toHaveLength(5)
    expect(pressables[1].props.accessibilityState).toEqual({
      checked: true,
      disabled: undefined,
    })
    expect(pressables[2].props.accessibilityState).toEqual({
      checked: true,
      disabled: false,
      busy: false,
    })
    expect(pressables[3].props.accessibilityState).toEqual({
      checked: false,
      disabled: false,
      busy: false,
    })
    expect(JSON.stringify(tree.toJSON())).toContain(
      formatPrice(plans.yearly.unitAmount, plans.currency),
    )
  })

  it('owns loading and retry states for the price tiers', () => {
    const onRetry = vi.fn()
    const loading = renderSelection('yearly', { plans: null, isLoading: true })
    expect(JSON.stringify(loading.toJSON())).toContain('upgrade.plans.loading')

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

  it('selects monthly separately and exposes the quiet free escape hatch', () => {
    const onSelectInterval = vi.fn()
    const onStayFree = vi.fn()
    const tree = renderSelection('yearly', { onSelectInterval, onStayFree })

    const pressables = tree.root.findAllByType('Pressable')
    TestRenderer.act(() => {
      pressables[0].props.onPress()
    })
    expect(onSelectInterval).toHaveBeenCalledWith('monthly')

    TestRenderer.act(() => {
      pressables[4].props.onPress()
    })
    expect(onStayFree).toHaveBeenCalledTimes(1)
  })
})
