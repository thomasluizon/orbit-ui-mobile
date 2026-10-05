import type { StatTileProps } from '@orbit/shared/contracts/display'

function shownStatValue(props: StatTileProps): string {
  if (props.state === 'empty') return props.emptyLabel
  if (props.state === 'loading') return ''
  return String(props.value)
}

function TileValue({ shownValue, isEmpty }: Readonly<{
  shownValue: string
  isEmpty: boolean
}>) {
  return (
    <span
      className="min-w-0 max-w-full"
      title={shownValue}
      style={{
        color: isEmpty ? 'var(--fg-3)' : 'var(--fg-1)',
        fontFamily: isEmpty ? 'var(--font-mono)' : 'var(--font-display)',
        fontSize: isEmpty ? 12 : 22,
        fontWeight: isEmpty ? 500 : 600,
        fontVariantNumeric: 'tabular-nums',
        lineHeight: isEmpty ? (22 * 1.4) / 12 : 1.4,
        whiteSpace: 'nowrap',
      }}
    >
      {shownValue}
    </span>
  )
}

export function StatTile(props: Readonly<StatTileProps>) {
  const { label, state = 'default' } = props
  const isEmpty = state === 'empty'
  const isLoading = state === 'loading'
  const shownValue = shownStatValue(props)

  return (
    <div
      className="flex min-w-0 flex-1 flex-col items-start gap-2 rounded-[20px] bg-[var(--bg-card)] p-4 text-start"
      style={{ boxShadow: 'inset 0 0 0 1px var(--hairline)', minWidth: 'max-content' }}
      data-state={state}
      data-variant={isLoading ? 'stat-tile' : undefined}
      role={isLoading ? 'status' : undefined}
      aria-label={isLoading ? props.loadingLabel : undefined}
      aria-busy={isLoading || undefined}
    >
      {isLoading ? (
        <span aria-hidden="true" className="relative" style={{ width: '100%', maxWidth: 64, fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: 1.4 }}>
          <span className="invisible">0</span><span className="absolute inset-x-0 top-1/2 h-[22px] -translate-y-1/2 skeleton-pulse rounded-[8px] bg-[var(--bg-elev-2)]" />
        </span>
      ) : (
        <TileValue shownValue={shownValue} isEmpty={isEmpty} />
      )}
      <span
        className="relative min-w-0"
        style={{
          color: isEmpty ? 'var(--fg-3)' : 'var(--fg-2)',
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          lineHeight: '20px',
          whiteSpace: 'nowrap',
        }}
      >
        {isLoading ? <><span className="invisible" aria-hidden="true">{label}</span><span aria-hidden="true" className="absolute inset-y-0 start-0 w-2/3 skeleton-pulse rounded-[8px] bg-[var(--bg-elev-2)]" /></> : label}
      </span>
    </div>
  )
}
