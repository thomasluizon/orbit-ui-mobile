import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { CalendarStats } from '@/components/calendar/calendar-stats'

function utilityPixels(element: HTMLElement, prefix: string): number {
  const match = element.className.match(new RegExp(`(?:^|\\s)${prefix}-(\\d+)(?:\\s|$)`))
  return match ? Number(match[1]) * 4 : 0
}

function measureChildHeight(element: HTMLElement): number {
  return Math.max(
    utilityPixels(element, 'h'),
    utilityPixels(element, 'min-h'),
    Number.parseFloat(element.style.lineHeight) || 0,
  )
}

function measureTileHeight(tile: HTMLElement): number {
  const children = Array.from(tile.children) as HTMLElement[]
  const padding = utilityPixels(tile, 'p') * 2
  const gaps = utilityPixels(tile, 'gap') * Math.max(0, children.length - 1)
  const content = children.reduce((height, child) => height + measureChildHeight(child), 0)
  return Math.max(Number.parseFloat(tile.style.minHeight) || 0, padding + gaps + content)
}

describe('CalendarStats', () => {
  it('renders the three month figures in three columns', () => {
    render(
      <CalendarStats
        stats={[
          { key: 'bestStreak', value: 5, label: 'Best streak' },
          { key: 'totalLogs', value: 12, label: 'Logs' },
          { key: 'missed', value: 3, label: 'Missed' },
        ] as const}
      />,
    )

    expect(screen.getByTestId('calendar-stats')).toHaveStyle({
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: '12px',
    })
    expect(screen.getByText('Best streak')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Logs')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('Missed')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('uses each tile own loading state', () => {
    render(
      <CalendarStats
        stats={[
          { key: 'bestStreak', value: 5, label: 'Best streak' },
          { key: 'totalLogs', value: 12, label: 'Total logs' },
          { key: 'missed', value: 3, label: 'Missed' },
        ]}
        state="loading"
        loadingLabel="Loading"
      />,
    )

    expect(screen.getByTestId('calendar-stats')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getAllByRole('status', { name: 'Loading', hidden: true })).toHaveLength(3)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('keeps every pending tile at its loaded height', () => {
    const stats = [
      { key: 'bestStreak', value: 5, label: 'Best streak' },
      { key: 'totalLogs', value: 12, label: 'Total logs' },
      { key: 'missed', value: 3, label: 'Missed' },
    ] as const
    const { container } = render(
      <>
        <CalendarStats stats={stats} />
        <CalendarStats stats={stats} state="loading" loadingLabel="Loading" />
      </>,
    )

    const loadedHeights = Array.from(container.querySelectorAll<HTMLElement>('[data-state="default"]'))
      .map(measureTileHeight)
    const pendingHeights = Array.from(container.querySelectorAll<HTMLElement>('[data-state="loading"]'))
      .map(measureTileHeight)

    expect(loadedHeights).toHaveLength(3)
    expect(pendingHeights).toEqual(loadedHeights)
  })

  it('states no data instead of zero for an empty month', () => {
    render(
      <CalendarStats
        stats={[
          { key: 'bestStreak', value: 0, label: 'Best streak' },
          { key: 'totalLogs', value: 0, label: 'Total logs' },
          { key: 'missed', value: 0, label: 'Missed' },
        ]}
        state="empty"
        emptyLabel="no data"
      />,
    )

    expect(screen.getAllByText('no data')).toHaveLength(3)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})
