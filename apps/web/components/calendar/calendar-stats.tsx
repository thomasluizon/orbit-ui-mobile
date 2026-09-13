import { StatTile } from '@/components/ui/stat-tile'

export interface CalendarStat {
  key: string
  value: string | number
  label: string
}

interface CalendarStatsBaseProps {
  stats: readonly [CalendarStat, CalendarStat, CalendarStat]
}

type CalendarStatsProps = CalendarStatsBaseProps & (
  | { state?: 'default'; loadingLabel?: never }
  | { state: 'loading'; loadingLabel: string }
)

/** The three month figures, kept in one row at every width. */
export function CalendarStats(props: Readonly<CalendarStatsProps>) {
  const isLoading = props.state === 'loading'

  return (
    <div
      className="grid"
      data-testid="calendar-stats"
      aria-hidden={isLoading || undefined}
      style={{
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 12,
        padding: '0 16px',
      }}
    >
      {props.stats.map((stat) => (
        isLoading ? (
          <StatTile key={stat.key} state="loading" label="" loadingLabel={props.loadingLabel} />
        ) : (
          <StatTile key={stat.key} value={stat.value} label={stat.label} />
        )
      ))}
    </div>
  )
}
