import { StatTile } from '@/components/ui/stat-tile'

export interface CalendarStat {
  key: string
  emoji: string
  value: string | number
  label: string
}

interface CalendarStatsProps {
  stats: ReadonlyArray<CalendarStat>
}

/** At-a-glance month stat tiles. Data-driven so new stats drop in as array
 *  entries; the auto-fit grid reflows them without a layout rewrite. */
export function CalendarStats({ stats }: Readonly<CalendarStatsProps>) {
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
        <StatTile key={stat.key} emoji={stat.emoji} value={stat.value} label={stat.label} />
      ))}
    </div>
  )
}
