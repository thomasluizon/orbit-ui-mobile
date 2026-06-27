import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { CalendarStats } from '@/components/calendar/calendar-stats'

describe('CalendarStats', () => {
  it('renders one stat tile per stat entry', () => {
    render(
      <CalendarStats
        stats={[
          { key: 'bestStreak', emoji: '🔥', value: 5, label: 'Best streak' },
          { key: 'totalLogs', emoji: '✅', value: 12, label: 'Total logs' },
          { key: 'missed', emoji: '⚠️', value: 3, label: 'Missed' },
        ]}
      />,
    )

    expect(screen.getByText('Best streak')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Total logs')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('Missed')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })
})
