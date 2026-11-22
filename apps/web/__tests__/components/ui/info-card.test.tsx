import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Zap } from '@/components/ui/icons'
import { InfoCard } from '@/components/ui/info-card'

describe('InfoCard', () => {
  it('renders title and description', () => {
    render(<InfoCard><span>Orbit</span><span>Sua assistente de hábitos</span></InfoCard>)
    expect(screen.getByText('Orbit')).toBeInTheDocument()
    expect(screen.getByText('Sua assistente de hábitos')).toBeInTheDocument()
  })

  it('renders without a description', () => {
    render(<InfoCard>Orbit</InfoCard>)
    expect(screen.getByText('Orbit')).toBeInTheDocument()
  })

  it('renders a custom icon and trailing slot', () => {
    render(
      <InfoCard icon={<Zap />}>
        <span data-testid="trailing-node">Orbit</span>
      </InfoCard>,
    )
    expect(screen.getByTestId('trailing-node')).toBeInTheDocument()
  })
})
