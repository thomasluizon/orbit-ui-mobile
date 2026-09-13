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

  it('uses each tile own loading state', () => {
    render(
      <CalendarStats
        stats={[
          { key: 'bestStreak', emoji: '🔥', value: 5, label: 'Best streak' },
          { key: 'totalLogs', emoji: '✅', value: 12, label: 'Total logs' },
          { key: 'missed', emoji: '⚠️', value: 3, label: 'Missed' },
        ]}
        state="loading"
        loadingLabel="Loading"
      />,
    )

    expect(screen.getAllByRole('status', { name: 'Loading' })).toHaveLength(3)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('states no data instead of zero for an empty month', () => {
    render(
      <CalendarStats
        stats={[
          { key: 'bestStreak', emoji: '🔥', value: 0, label: 'Best streak' },
          { key: 'totalLogs', emoji: '✅', value: 0, label: 'Total logs' },
          { key: 'missed', emoji: '⚠️', value: 0, label: 'Missed' },
        ]}
        state="empty"
        emptyLabel="no data"
      />,
    )

    expect(screen.getAllByText('no data')).toHaveLength(3)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})
