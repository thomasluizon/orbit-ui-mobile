import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { CalendarStats } from '@/components/calendar/calendar-stats'

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
})
