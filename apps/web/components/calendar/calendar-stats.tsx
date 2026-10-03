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
      style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '0 16px', fontSize: 14 }}>
      {stats.map((stat) => (
        <div key={stat.key} data-state={state} className="flex min-w-0 flex-col items-center justify-center gap-1 py-4 text-center" style={{ minHeight: 88, flex: '1 0 0', minWidth: 'max-content' }}>
          {isLoading ? <div role="status" aria-label={loadingLabel} className="relative" style={{ minWidth: 64, fontSize: 22, lineHeight: '30.8px', fontFamily: 'var(--font-display)' }}>
            <span aria-hidden="true" className="invisible">0</span><span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-6 -translate-y-1/2 animate-pulse rounded-[8px] bg-[var(--bg-elev-2)]" />
          </div>
            : <span className="tabular-nums" style={{ fontSize: state === 'empty' ? 12 : 22, fontFamily: state === 'empty' ? 'var(--font-mono)' : 'var(--font-display)', fontWeight: state === 'empty' ? 500 : 600, lineHeight: '30.8px', color: state === 'empty' ? 'var(--fg-3)' : 'var(--fg-1)' }}>{state === 'empty' ? emptyLabel : stat.value}</span>}
          <span style={{ fontSize: 'inherit', fontFamily: 'var(--font-sans)', fontWeight: 400, lineHeight: '20px', color: 'var(--fg-2)' }}>{stat.label}</span>
        </div>
      ))}
    </div>
  )
}
