import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { useTranslations } from 'next-intl'
import { PlanSelection } from '@/components/upgrade/plan-selection'
import { formatPrice } from '@/hooks/use-subscription-plans'

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
    trialActive: false,
    checkoutLoading: null,
    onCheckout: vi.fn(),
    onStayFree: vi.fn(),
    onRetry: vi.fn(),
    t,
    ...overrides,
  }
  const view = render(<PlanSelection {...props} />)
  return { ...props, unmount: view.unmount }
}

describe('PlanSelection', () => {
  it('separates the annual default interval from the plan actions', () => {
    renderSelection()
    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(screen.getAllByRole('radio')).toHaveLength(2)
    expect(screen.getByRole('radio', { name: 'upgrade.plans.interval.annual' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('button', { name: /upgrade\.free/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: /upgrade\.plans\.yearly\.name/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /upgrade\.plans\.monthly\.name/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: /upgrade\.plans\.yearly\.name/ })).toHaveTextContent(
      formatPrice(plans.yearly.unitAmount, plans.currency),
    )
  })

  it('switches the rendered interval without starting checkout', () => {
    const onCheckout = vi.fn()
    renderSelection({ onCheckout })

    fireEvent.click(screen.getByRole('radio', { name: 'upgrade.plans.interval.monthly' }))

    expect(screen.getByRole('radio', { name: 'upgrade.plans.interval.monthly' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('button', { name: /upgrade\.plans\.monthly\.name/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(onCheckout).not.toHaveBeenCalled()
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

  it('keeps the same accessible plan choices across trial states', () => {
    const { unmount } = render(
      <PlanSelection
        plans={plans}
        isLoading={false}
        isError={false}
        isOnline
        discountedAmount={(amount) => amount}
        trialActive
        checkoutLoading={null}
        onCheckout={vi.fn()}
        onStayFree={vi.fn()}
        onRetry={vi.fn()}
        t={t}
      />,
    )
    expect(
      screen.getByRole('button', { name: /upgrade\.plans\.yearly\.name/ }),
    ).toBeInTheDocument()
    expect(screen.queryByText('upgrade.convert.trialCta')).not.toBeInTheDocument()
    unmount()

    render(
      <PlanSelection
        plans={plans}
        isLoading={false}
        isError={false}
        isOnline
        discountedAmount={(amount) => amount}
        trialActive={false}
        checkoutLoading={null}
        onCheckout={vi.fn()}
        onStayFree={vi.fn()}
        onRetry={vi.fn()}
        t={t}
      />,
    )
    expect(
      screen.getByRole('button', { name: /upgrade\.plans\.yearly\.name/ }),
    ).toBeInTheDocument()
    expect(screen.queryByText('upgrade.convert.freeCta')).not.toBeInTheDocument()
  })

  it('checks out the chosen interval and keeps the free escape hatch', () => {
    const onCheckout = vi.fn()
    const onStayFree = vi.fn()
    renderSelection({ onCheckout, onStayFree })

    fireEvent.click(screen.getByRole('button', { name: /upgrade\.plans\.yearly\.name/ }))
    expect(onCheckout).toHaveBeenCalledWith('yearly')

    fireEvent.click(screen.getByRole('button', { name: /upgrade\.plans\.monthly\.name/ }))
    expect(onCheckout).toHaveBeenCalledWith('monthly')

    fireEvent.click(screen.getByRole('button', { name: /upgrade\.free/ }))
    expect(onStayFree).toHaveBeenCalledTimes(1)
  })

  it('locks every choice while a paid checkout is pending', () => {
    const onCheckout = vi.fn()
    const onStayFree = vi.fn()
    renderSelection({ checkoutLoading: 'yearly', onCheckout, onStayFree })

    const free = screen.getByRole('button', { name: /upgrade\.free/ })
    const yearly = screen.getByRole('button', { name: /upgrade\.plans\.yearly\.name/ })
    const monthly = screen.getByRole('button', { name: /upgrade\.plans\.monthly\.name/ })

    expect(free).toBeDisabled()
    expect(yearly).toBeDisabled()
    expect(yearly).toHaveAttribute('aria-busy', 'true')
    expect(monthly).toBeDisabled()

    fireEvent.click(free)
    fireEvent.click(yearly)
    fireEvent.click(monthly)
    expect(onStayFree).not.toHaveBeenCalled()
    expect(onCheckout).not.toHaveBeenCalled()
  })
})
