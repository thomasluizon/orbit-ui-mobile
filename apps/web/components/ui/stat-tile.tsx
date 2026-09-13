import type { StatTileProps } from '@orbit/shared/contracts/display'

export const STAT_TILE_MIN_HEIGHT = 132

/** A fixed-height stat surface whose loading and empty states never reflow the row. */
export function StatTile(props: Readonly<StatTileProps>) {
  const { label, state = 'default' } = props
  const isEmpty = state === 'empty'
  const isLoading = state === 'loading'
  const shownValue = isEmpty ? props.emptyLabel : String(props.value)

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-2 rounded-[20px] bg-[var(--bg-card)] p-6 text-center"
      style={{ boxShadow: 'inset 0 0 0 1px var(--hairline)', minHeight: STAT_TILE_MIN_HEIGHT }}
      data-state={state}
      role={isLoading ? 'status' : undefined}
      aria-label={isLoading ? props.loadingLabel : undefined}
      aria-busy={isLoading || undefined}
    >
      {isLoading ? (
        <>
          <span className="h-6 w-16 animate-pulse rounded-[8px] bg-[var(--bg-elev-2)]" aria-hidden="true" />
          <span className="h-5 w-20 animate-pulse rounded-[8px] bg-[var(--bg-elev-2)]" aria-hidden="true" />
        </>
      ) : (
        <span
          className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap"
          title={shownValue}
          style={{
            color: isEmpty ? 'var(--fg-3)' : 'var(--fg-1)',
            fontFamily: isEmpty ? 'var(--font-mono)' : 'var(--font-display)',
            fontSize: isEmpty ? 12 : 24,
            fontWeight: isEmpty ? 500 : 600,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: '24px',
          }}
        >
          {shownValue}
        </span>
      )}
      <span
        className="line-clamp-2 min-h-10"
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
