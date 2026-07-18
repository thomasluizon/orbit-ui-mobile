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

  it('reserves a two-line label box so tiles in a row share a baseline', () => {
    render(<StatTile emoji="🏆" value={3} label="Maior" />)
    expect(screen.getByText('Maior')).toHaveStyle({ minHeight: '40px' })
  })

  it('keeps a long label reachable in full when it clamps', () => {
    const longLabel = 'Melhor sequência de hábitos concluídos'
    render(<StatTile emoji="🥇" value={9} label={longLabel} />)
    const label = screen.getByText(longLabel)
    expect(label).toHaveAttribute('title', longLabel)
  })

  it('keeps a long value reachable in full when it truncates', () => {
    const longValue = '1.284.937 conclusões'
    render(<StatTile emoji="✅" value={longValue} label="Registros" />)
    expect(screen.getByText(longValue)).toHaveAttribute('title', longValue)
  })
})
