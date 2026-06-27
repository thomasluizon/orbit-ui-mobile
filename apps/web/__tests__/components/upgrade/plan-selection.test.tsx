import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { useTranslations } from 'next-intl'
import { PlanSelection } from '@/components/upgrade/plan-selection'

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
    discountedAmount: (amount: number) => amount,
    trialActive: false,
    checkoutLoading: null,
    onCheckout: vi.fn(),
    onStayFree: vi.fn(),
    t,
    ...overrides,
  }
  render(<PlanSelection {...props} />)
  return props
}

describe('PlanSelection', () => {
  it('renders three plan cards with yearly as the glowing hero CTA', () => {
    renderSelection()
    expect(screen.getByText('upgrade.free')).toBeInTheDocument()
    expect(screen.getByText('upgrade.plans.yearly.name')).toBeInTheDocument()
    expect(screen.getByText('upgrade.plans.monthly.name')).toBeInTheDocument()
    expect(screen.getByTestId('paywall-checkout')).toBeInTheDocument()
  })

  it('switches the hero CTA copy by trial state', () => {
    const { unmount } = render(
      <PlanSelection
        plans={plans}
        discountedAmount={(amount) => amount}
        trialActive
        checkoutLoading={null}
        onCheckout={vi.fn()}
        onStayFree={vi.fn()}
        t={t}
      />,
    )
    expect(screen.getByTestId('paywall-checkout')).toHaveTextContent('upgrade.convert.trialCta')
    unmount()

    render(
      <PlanSelection
        plans={plans}
        discountedAmount={(amount) => amount}
        trialActive={false}
        checkoutLoading={null}
        onCheckout={vi.fn()}
        onStayFree={vi.fn()}
        t={t}
      />,
    )
    expect(screen.getByTestId('paywall-checkout')).toHaveTextContent('upgrade.convert.freeCta')
  })

  it('checks out the chosen interval and keeps the free escape hatch', () => {
    const onCheckout = vi.fn()
    const onStayFree = vi.fn()
    renderSelection({ onCheckout, onStayFree })

    fireEvent.click(screen.getByTestId('paywall-checkout'))
    expect(onCheckout).toHaveBeenCalledWith('yearly')

    fireEvent.click(screen.getByRole('button', { name: 'upgrade.plans.monthly.cta' }))
    expect(onCheckout).toHaveBeenCalledWith('monthly')

    fireEvent.click(screen.getByRole('button', { name: 'upgrade.convert.stayFree' }))
    expect(onStayFree).toHaveBeenCalledTimes(1)
  })
})
