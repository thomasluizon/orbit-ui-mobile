import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlanCard } from '@/components/upgrade/plan-card'

describe('PlanCard', () => {
  it('renders name, badge, price, period, sub, and features', () => {
    render(
      <PlanCard
        variant="anchor"
        name="Pro Monthly"
        badge="Save 58%"
        price="$9.99"
        period="/mo"
        sub="Billed monthly"
        features={['Unlimited habits', '500 AI messages/month']}
        ctaLabel="Subscribe Monthly"
        onCta={() => {}}
      />,
    )
    expect(screen.getByText('Pro Monthly')).toBeInTheDocument()
    expect(screen.getByText('Save 58%')).toBeInTheDocument()
    expect(screen.getByText('$9.99')).toBeInTheDocument()
    expect(screen.getByText('/mo')).toBeInTheDocument()
    expect(screen.getByText('Billed monthly')).toBeInTheDocument()
    expect(screen.getByText('Unlimited habits')).toBeInTheDocument()
  })

  it('fires onCta when the CTA is clicked', () => {
    const onCta = vi.fn()
    render(
      <PlanCard
        variant="hero"
        name="Pro Yearly"
        price="$4.16"
        period="/mo"
        ctaLabel="Subscribe to keep Pro"
        onCta={onCta}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe to keep Pro' }))
    expect(onCta).toHaveBeenCalledTimes(1)
  })

  it('renders the yearly hero line when provided', () => {
    render(
      <PlanCard
        variant="hero"
        name="Pro Yearly"
        price="$4.16"
        period="/mo"
        heroLine="Everything in Pro Monthly, plus AI Retrospective."
        ctaLabel="Upgrade to Pro"
        onCta={() => {}}
      />,
    )
    expect(
      screen.getByText('Everything in Pro Monthly, plus AI Retrospective.'),
    ).toBeInTheDocument()
  })
})
