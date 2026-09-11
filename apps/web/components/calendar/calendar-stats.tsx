import { StatTile } from '@/components/ui/stat-tile'

export interface CalendarStat {
  key: string
  emoji: string
  value: string | number
  label: string
}

interface CalendarStatsProps {
  stats: ReadonlyArray<CalendarStat>
  state?: 'default' | 'loading' | 'empty'
  loadingLabel?: string
  emptyLabel?: string
}

/** At-a-glance month stat tiles. Data-driven so new stats drop in as array
 *  entries; the auto-fit grid reflows them without a layout rewrite. */
export function CalendarStats({
  stats,
  state = 'default',
  loadingLabel,
  emptyLabel,
}: Readonly<CalendarStatsProps>) {
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
        gap: 10,
        padding: '0 20px',
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
