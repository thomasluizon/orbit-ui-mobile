import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Zap } from '@/components/ui/icons'
import { InfoCard } from '@/components/ui/info-card'

describe('InfoCard', () => {
  it('renders title and description', () => {
    render(<InfoCard title="Astra" desc="Sua assistente de hábitos" />)
    expect(screen.getByText('Astra')).toBeInTheDocument()
    expect(screen.getByText('Sua assistente de hábitos')).toBeInTheDocument()
  })

  it('renders without a description', () => {
    render(<InfoCard title="Astra" />)
    expect(screen.getByText('Astra')).toBeInTheDocument()
  })

  it('recedes to the quiet tone by default and exposes an accent opt-in', () => {
    const { container, rerender } = render(<InfoCard title="Astra" />)
    expect(container.querySelector('[data-info-card]')).toHaveAttribute('data-tone', 'quiet')

    rerender(<InfoCard title="Astra" tone="accent" />)
    expect(container.querySelector('[data-info-card]')).toHaveAttribute('data-tone', 'accent')
  })

  it('renders a custom icon and trailing slot', () => {
    render(
      <InfoCard
        icon={Zap}
        title="Astra"
        trailing={<span data-testid="trailing-node" />}
      />,
    )
    expect(screen.getByTestId('trailing-node')).toBeInTheDocument()
  })
})
