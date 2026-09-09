import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { StatTile } from '@/components/ui/stat-tile'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

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

  it.each(['dark', 'light'] as const)('keeps empty text above the normal-text contrast floor in %s', (mode) => {
    render(<StatTile state="empty" emptyLabel="No data" label="Top habit" />)
    const renderedColor = screen.getByText('No data').style.color
    const theme = resolveWebThemeVariables('purple', mode)
    const foreground = theme[renderedColor.slice(4, -1) as `--${string}`]!

    expect(contrastOnSurface(foreground, [theme['--bg']!, theme['--bg-card']!]))
      .toBeGreaterThanOrEqual(4.5)
  })
})
