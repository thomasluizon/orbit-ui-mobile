import type { ColumnsProps } from '@orbit/shared/contracts/display'

/** A categorical comparison with no time axis or implied gaps. */
export function Columns({
  columns = [],
  max,
  height = 120,
  currentId,
  showValues = false,
  label,
  emptyLabel,
}: Readonly<ColumnsProps>) {
  const measuredMax = Math.max(0, ...columns.map((column) => column.value))
  const scaleMax = max !== undefined && max > 0 ? max : measuredMax
  const allZero = measuredMax === 0

  return (
    <div className="flex w-full items-end gap-4" style={{ height }} role="group" aria-label={label}>
      {columns.map((column) => {
        const ratio = scaleMax > 0 ? Math.min(1, Math.max(0, column.value / scaleMax)) : 0
        const isCurrent = column.id === currentId
        const accessibleValue = allZero ? emptyLabel : String(column.value)

        return (
          <div
            key={column.id}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
            role="img"
            aria-label={`${column.label}: ${accessibleValue}`}
            data-current={isCurrent || undefined}
            data-zero={column.value === 0 || undefined}
          >
            {showValues ? (
              <span className="font-mono text-xs text-[var(--fg-2)]">{accessibleValue}</span>
            ) : null}
            <span className="flex min-h-0 w-full flex-1 items-end justify-center" aria-hidden="true">
              <span
                className="block w-full max-w-12 rounded-t-[8px]"
                style={{
                  background: column.value === 0 ? 'var(--status-empty)' : isCurrent ? 'var(--primary)' : 'var(--fg-3)',
                  height: column.value === 0 ? 2 : `${ratio * 100}%`,
                }}
              />
            </span>
            <span className="line-clamp-2 min-h-10 text-center text-sm leading-5 text-[var(--fg-2)]">
              {column.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
