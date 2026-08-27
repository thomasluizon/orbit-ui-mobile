import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatTile } from '@/components/ui/stat-tile'

describe('StatTile', () => {
  it('renders value and label', () => {
    render(<StatTile  value="7 dias" label="Sequência" />)
    expect(screen.getByText('7 dias')).toBeInTheDocument()
    expect(screen.getByText('Sequência')).toBeInTheDocument()
  })

  it('renders numeric values', () => {
    render(<StatTile  value={12} label="Total" />)
    expect(screen.getByText('12')).toBeInTheDocument()
  })
})
