import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlanCard } from '@/components/upgrade/plan-card'

describe('PlanCard', () => {
  it('renders name, badge, price, sub, and features', () => {
    render(
      <PlanCard
        name="Anual"
        badge="Economize 20%"
        price="R$ 79,90"
        sub="por ano"
        features={['Astra ilimitada', 'Widgets']}
        selected={false}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText('Anual')).toBeInTheDocument()
    expect(screen.getByText('Economize 20%')).toBeInTheDocument()
    expect(screen.getByText('R$ 79,90')).toBeInTheDocument()
    expect(screen.getByText('por ano')).toBeInTheDocument()
    expect(screen.getByText('Astra ilimitada')).toBeInTheDocument()
    expect(screen.getByText('Widgets')).toBeInTheDocument()
  })

  it('fires onSelect when clicked', () => {
    const onSelect = vi.fn()
    render(
      <PlanCard name="Mensal" price="R$ 9,90" selected={false} onSelect={onSelect} />,
    )
    fireEvent.click(screen.getByRole('radio'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('exposes the selected state via aria-checked', () => {
    const { rerender } = render(
      <PlanCard name="Mensal" price="R$ 9,90" selected={false} onSelect={() => {}} />,
    )
    expect(screen.getByRole('radio')).toHaveAttribute('aria-checked', 'false')

    rerender(
      <PlanCard name="Mensal" price="R$ 9,90" selected onSelect={() => {}} />,
    )
    expect(screen.getByRole('radio')).toHaveAttribute('aria-checked', 'true')
  })
})
