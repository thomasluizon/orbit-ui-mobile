
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

export function CalendarStats({ stats, state = 'default', loadingLabel, emptyLabel }: Readonly<CalendarStatsProps>) {
  const isLoading = state === 'loading'
  return (
    <div data-testid="calendar-stats" aria-hidden={isLoading || undefined}
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 5.5em), 1fr))', gap: 12, padding: '0 16px', fontSize: 14 }}>
      {stats.map((stat) => (
        <div key={stat.key} data-state={state} className="flex min-w-0 flex-col items-center justify-center gap-1 py-4 text-center" style={{ minHeight: 88 }}>
          {isLoading ? <div role="status" aria-label={loadingLabel}><span aria-hidden="true" className="block h-6 w-16 animate-pulse rounded-[8px] bg-[var(--bg-elev-2)]" /></div>
            : <span className="font-display font-semibold tabular-nums" style={{ fontSize: state === 'empty' ? '0.857143em' : '1.571429em', lineHeight: 1.4, color: state === 'empty' ? 'var(--fg-3)' : 'var(--fg-1)' }}>{state === 'empty' ? emptyLabel : stat.value}</span>}
          <span style={{ fontSize: 'inherit', lineHeight: 1.4, color: 'var(--fg-2)' }}>{stat.label}</span>
        </div>
      ))}
    </div>
  )
}
