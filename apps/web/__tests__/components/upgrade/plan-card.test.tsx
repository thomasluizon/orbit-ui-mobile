import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlanCard } from '@/components/upgrade/plan-card'

describe('PlanCard', () => {
  it('renders name, badge, and price', () => {
    render(
      <PlanCard
        name="Pro Monthly"
        badge={<span>Save 58%</span>}
        price="$9.99"
        onClick={() => {}}
      />,
    )
    expect(screen.getByText('Pro Monthly')).toBeInTheDocument()
    expect(screen.getByText('Save 58%')).toBeInTheDocument()
    expect(screen.getByText('$9.99')).toBeInTheDocument()
  })

  it('fires onClick when the card is clicked', () => {
    const onClick = vi.fn()
    render(
      <PlanCard
        name="Pro Yearly"
        price="$4.16"
        onClick={onClick}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('exposes selected state', () => {
    render(<PlanCard name="Pro Yearly" price="$4.16" selected />)
    expect(screen.getByRole('button')).toHaveAttribute('data-selected', 'true')
  })

  it('blocks activation and exposes disabled and busy state while loading', () => {
    const onClick = vi.fn()
    render(<PlanCard name="Pro Yearly" price="$4.16" loading onClick={onClick} />)
    const button = screen.getByRole('button')

    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})
