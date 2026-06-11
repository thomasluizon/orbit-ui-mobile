import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatTile } from '@/components/ui/stat-tile'

describe('StatTile', () => {
  it('renders emoji, value, and label', () => {
    render(<StatTile emoji="🔥" value="7 dias" label="Sequência" />)
    expect(screen.getByText('🔥')).toBeInTheDocument()
    expect(screen.getByText('7 dias')).toBeInTheDocument()
    expect(screen.getByText('Sequência')).toBeInTheDocument()
  })

  it('renders numeric values', () => {
    render(<StatTile emoji="⭐" value={12} label="Total" />)
    expect(screen.getByText('12')).toBeInTheDocument()
  })
})
