import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { useTranslations } from 'next-intl'
import { PlanSelection } from '@/components/upgrade/plan-selection'
import { formatPrice, monthlyEquivalent } from '@/hooks/use-subscription-plans'

vi.mock('@/hooks/use-subscription-plans', () => ({
  useSubscriptionPlans: () => ({}),
  formatPrice: (amount: number, currency: string) => `${currency} ${(amount / 100).toFixed(2)}`,
  monthlyEquivalent: (amount: number) => Math.round(amount / 12),
}))

const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as unknown as ReturnType<typeof useTranslations>

const plans = {
  monthly: { unitAmount: 999, currency: 'usd' },
  yearly: { unitAmount: 4999, currency: 'usd' },
  savingsPercent: 58,
  couponPercentOff: null,
  currency: 'usd',
}

function renderSelection(overrides: Partial<Parameters<typeof PlanSelection>[0]> = {}) {
  const props = {
    plans,
    isLoading: false,
    isError: false,
    isOnline: true,
    discountedAmount: (amount: number) => amount,
    checkoutLoading: null,
    onCheckout: vi.fn(),
    onRetry: vi.fn(),
    t,
    ...overrides,
  }
  const view = render(<PlanSelection {...props} />)
  return { ...props, unmount: view.unmount }
}

function tierNamed(name: string) {
  return screen.getByRole('heading', { level: 2, name }).closest('section')!
}

describe('PlanSelection', () => {
  it('leads with annual and gives the recommended tier the only filled action', () => {
    renderSelection()

    expect(screen.getAllByRole('radio')).toHaveLength(2)
    expect(screen.getByRole('radio', { name: 'upgrade.plans.interval.annual' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'upgrade.plans.yearly.name',
      'upgrade.plans.monthly.name',
    ])
    expect(screen.getAllByText('upgrade.plans.recommended')).toHaveLength(1)
    expect(within(tierNamed('upgrade.plans.yearly.name')).getByRole('button')).toHaveAttribute(
      'data-variant',
      'primary',
    )
    expect(within(tierNamed('upgrade.plans.monthly.name')).getByRole('button')).toHaveAttribute(
      'data-variant',
      'ghost',
    )
  })

  it('switches the rendered order without starting checkout', () => {
    const onCheckout = vi.fn()
    renderSelection({ onCheckout })

    fireEvent.click(screen.getByRole('radio', { name: 'upgrade.plans.interval.monthly' }))

    expect(screen.getByRole('radio', { name: 'upgrade.plans.interval.monthly' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'upgrade.plans.monthly.name',
      'upgrade.plans.yearly.name',
    ])
    expect(within(tierNamed('upgrade.plans.monthly.name')).getByRole('button')).toHaveAttribute(
      'data-variant',
      'primary',
    )
    expect(onCheckout).not.toHaveBeenCalled()
  })

  it('renders annual arithmetic from the payload', () => {
    renderSelection()

    expect(tierNamed('upgrade.plans.yearly.name')).toHaveTextContent(
      formatPrice(plans.yearly.unitAmount, plans.currency),
    )
    expect(tierNamed('upgrade.plans.yearly.name')).toHaveTextContent(
      `upgrade.plans.yearly.equivalent:${JSON.stringify({
        price: formatPrice(monthlyEquivalent(plans.yearly.unitAmount), plans.currency),
        percent: plans.savingsPercent,
      })}`,
    )
  })

  it('shows the payload coupon on both tiers only when it exists', () => {
    const couponPercentOff = 23
    const first = renderSelection({ plans: { ...plans, couponPercentOff } })
    expect(screen.getAllByText(
      `upgrade.plans.coupon.line:${JSON.stringify({ percent: couponPercentOff })}`,
    )).toHaveLength(2)

    first.unmount()
    renderSelection()
    expect(screen.queryByText(/upgrade\.plans\.coupon\.line/)).not.toBeInTheDocument()
  })

  it('owns loading and retry states for the price tiers', () => {
    const loading = renderSelection({ plans: null, isLoading: true })
    expect(screen.getAllByRole('progressbar')).toHaveLength(2)

    const onRetry = vi.fn()
    loading.unmount()
    renderSelection({ plans: null, isLoading: false, isError: true, onRetry })
    fireEvent.click(screen.getByRole('button', { name: 'upgrade.plans.retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('checks out from either tier with the same CTA verb', () => {
    const onCheckout = vi.fn()
    renderSelection({ onCheckout })

    const actions = screen.getAllByRole('button', { name: 'upgrade.plans.cta' })
    expect(actions).toHaveLength(2)
    fireEvent.click(actions[0]!)
    fireEvent.click(actions[1]!)
    expect(onCheckout).toHaveBeenNthCalledWith(1, 'yearly')
    expect(onCheckout).toHaveBeenNthCalledWith(2, 'monthly')
  })

  it('locks paid actions during checkout', () => {
    const onCheckout = vi.fn()
    renderSelection({ checkoutLoading: 'yearly', onCheckout })

    const paidActions = screen.getAllByRole('button', { name: 'upgrade.plans.cta' })
    expect(paidActions.every((action) => action.hasAttribute('disabled'))).toBe(true)
    expect(paidActions[0]).toHaveAttribute('aria-busy', 'true')
    expect(onCheckout).not.toHaveBeenCalled()
  })
})
