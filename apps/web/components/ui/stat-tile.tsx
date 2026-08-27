import type { StatTileProps } from '@orbit/shared/contracts/display'

/** A fixed-height stat surface whose loading and empty states never reflow the row. */
export function StatTile(props: Readonly<StatTileProps>) {
  const { label, state = 'default' } = props

  return (
    <div
      className="flex min-h-[132px] flex-1 flex-col items-center justify-center gap-2 rounded-[20px] bg-[var(--bg-card)] p-6 text-center"
      style={{ boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
      data-state={state}
      role={state === 'loading' ? 'status' : undefined}
      aria-label={state === 'loading' ? props.loadingLabel : undefined}
      aria-busy={state === 'loading' || undefined}
    >
      {state === 'loading' ? (
        <>
          <span className="h-6 w-16 animate-pulse rounded-[8px] bg-[var(--bg-elev-2)]" aria-hidden="true" />
          <span className="h-5 w-20 animate-pulse rounded-[8px] bg-[var(--bg-elev-2)]" aria-hidden="true" />
        </>
      ) : (
        <span
          style={{
            color: state === 'empty' ? 'var(--fg-4)' : 'var(--fg-1)',
            fontFamily: state === 'empty' ? 'var(--font-mono)' : 'var(--font-display)',
            fontSize: state === 'empty' ? 12 : 24,
            fontWeight: state === 'empty' ? 500 : 600,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: '24px',
          }}
        >
          {state === 'empty' ? props.emptyLabel : props.value}
        </span>
      )}
      <span
        className="line-clamp-2 min-h-10"
        style={{
          color: state === 'empty' ? 'var(--fg-3)' : 'var(--fg-2)',
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
