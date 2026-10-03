import type { StatTileProps } from '@orbit/shared/contracts/display'

export const STAT_TILE_MIN_HEIGHT = 132

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
        lineHeight: isEmpty ? '24px' : 1.4,
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
      className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-[20px] bg-[var(--bg-card)] p-4 min-[1024px]:p-6 text-center"
      style={{ boxShadow: 'inset 0 0 0 1px var(--hairline)', minHeight: STAT_TILE_MIN_HEIGHT }}
      data-state={state}
      role={isLoading ? 'status' : undefined}
      aria-label={isLoading ? props.loadingLabel : undefined}
      aria-busy={isLoading || undefined}
    >
      {isLoading ? (
        <span className="h-6 w-16 animate-pulse rounded-[8px] bg-[var(--bg-elev-2)]" aria-hidden="true" />
      ) : (
        <TileValue shownValue={shownValue} isEmpty={isEmpty} />
      )}
      <span
        className="min-w-0"
        style={{
          color: isEmpty ? 'var(--fg-3)' : 'var(--fg-2)',
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          lineHeight: '20px',
        }}
      >
        {label}
      </span>
    </div>
  )
}
