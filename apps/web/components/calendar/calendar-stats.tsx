import { StatTile } from '@/components/ui/stat-tile'

export interface CalendarStat {
  key: string
  value: string | number
  label: string
}

interface CalendarStatsProps {
  stats: readonly [CalendarStat, CalendarStat, CalendarStat]
  state?: 'default' | 'loading' | 'empty'
  loadingLabel?: string
  emptyLabel?: string
}

/** The three month figures, kept in one row at every width. */
export function CalendarStats({
  stats,
  state = 'default',
  loadingLabel,
  emptyLabel,
}: Readonly<CalendarStatsProps>) {
  return (
    <div
      className="grid"
      data-testid="calendar-stats"
      style={{
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 12,
        padding: '0 16px',
      }}
    >
      {stats.map((stat) => (
        state === 'loading' ? (
          <StatTile key={stat.key} state="loading" loadingLabel={loadingLabel ?? ''} label={stat.label} />
        ) : state === 'empty' ? (
          <StatTile key={stat.key} state="empty" emptyLabel={emptyLabel ?? ''} label={stat.label} />
        ) : (
          <StatTile key={stat.key} value={stat.value} label={stat.label} />
        )
      ))}
    </div>
  )
}
