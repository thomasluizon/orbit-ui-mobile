import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { STAT_TILE_MIN_HEIGHT, StatTile } from '@/components/ui/stat-tile'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

describe('StatTile', () => {
  it('renders value and label', () => {
    render(<StatTile  value="7 dias" label="Sequência" />)
    expect(screen.getByText('7 dias')).toBeInTheDocument()
    expect(screen.getByText('Sequência')).toBeInTheDocument()
  })

  it('renders numeric values', () => {
    render(<StatTile  value={12} label="Total" />)
    expect(screen.getByText('12')).toHaveStyle({ fontVariantNumeric: 'tabular-nums' })
  })

  it('keeps large weekday values on one line for the tile width query', () => {
    render(<StatTile value="Wednesday" label="Best weekday" valueSize="lg" />)
    const value = screen.getByText('Wednesday')
    expect(value).toHaveClass('stat-tile-large-value', 'max-w-full', 'whitespace-nowrap')
    expect(value).not.toHaveClass('overflow-hidden', 'text-ellipsis', 'break-words')
    expect(value).not.toHaveStyle({ overflowWrap: 'anywhere' })
    expect(value.parentElement).toHaveClass('stat-tile-large', 'px-6', 'py-4')
    expect(value.parentElement).toHaveStyle({ minHeight: STAT_TILE_MIN_HEIGHT })
    expect(24 + 40 + 8 + 2 * 16).toBeLessThanOrEqual(STAT_TILE_MIN_HEIGHT)
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
