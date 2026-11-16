import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CalendarStats } from '@/components/calendar/calendar-stats'
import { StatTile } from '@/components/ui/stat-tile'

const stats = [
  { key: 'bestStreak', value: 5, label: 'Best' },
  { key: 'totalLogs', value: 12, label: 'Logged' },
  { key: 'missed', value: 3, label: 'Not logged' },
] as const

function expectSkeletonBlocks(region: HTMLElement, count: number) {
  const blocks = [...region.querySelectorAll('.skeleton-pulse')]
  expect(blocks).toHaveLength(count)
  for (const block of blocks) {
    expect(block).toHaveClass('rounded-[var(--r-well)]', 'bg-[var(--bg-well)]')
    expect(block.closest('[data-variant="fill"]')).toHaveAttribute('aria-hidden', 'true')
  }
  expect(region.querySelector('.animate-pulse, [class*="--bg-elev"], [class*="rounded-[8px]"]')).toBeNull()
}

describe('a loading figure draws its placeholder from the Skeleton blocks', () => {
  it('fills the stat tile value and caption with the skeleton block and keeps one named busy region', () => {
    render(<StatTile state="loading" loadingLabel="Loading" label="Logged" />)
    const tile = screen.getByRole('status', { name: 'Loading' })
    expect(tile).toHaveAttribute('aria-busy', 'true')
    expectSkeletonBlocks(tile, 2)
  })

  it('fills each calendar figure value with the skeleton block', () => {
    render(<CalendarStats stats={stats} state="loading" loadingLabel="Loading" />)
    expect(screen.getAllByRole('status', { name: 'Loading', hidden: true })).toHaveLength(3)
    expectSkeletonBlocks(screen.getByTestId('calendar-stats'), 3)
  })
})
