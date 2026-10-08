import type { SkeletonProps } from '@orbit/shared/contracts/feedback'

const blockClass = 'skeleton-pulse rounded-[var(--r-well)] bg-[var(--bg-well)]'

function HabitRowSkeleton() {
  return (
    <div className="flex h-[68px] items-center gap-3 rounded-[var(--r-card)] bg-[var(--bg-card)] px-4">
      <span className={`${blockClass} size-[46px] shrink-0`} />
      <span className="flex flex-1 flex-col gap-2">
        <span className={`${blockClass} h-4 w-2/3`} />
        <span className={`${blockClass} h-3 w-1/3`} />
      </span>
      <span className={`${blockClass} size-[30px] shrink-0 rounded-full`} />
    </div>
  )
}

function SettingsSkeleton({ rows = 1 }: Readonly<{ rows?: number }>) {
  return (
    <div>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          data-settings-skeleton-row
          className="flex h-[52px] items-center gap-3 px-4"
        >
          <span className={`${blockClass} size-6 shrink-0`} />
          <span className="flex flex-1 flex-col gap-2">
            <span className={`${blockClass} h-4 w-1/2`} />
            <span className={`${blockClass} h-3 w-2/3`} />
          </span>
          <span className={`${blockClass} h-4 w-12 shrink-0`} />
        </div>
      ))}
    </div>
  )
}

function StatTileSkeleton() {
  return (
    <div
      className="flex flex-col items-start gap-2 rounded-[var(--r-card)] bg-[var(--bg-card)] p-4 shadow-[inset_0_0_0_1px_var(--hairline)]"
    >
      <span className="relative w-1/2" style={{ fontSize: 22, lineHeight: 1.4 }}>
        <span className="invisible">0</span><span className={`${blockClass} absolute inset-x-0 top-1/2 h-[22px] -translate-y-1/2`} />
      </span>
      <span className="relative w-2/3" style={{ fontSize: 14, lineHeight: '20px' }}>
        <span className="invisible">0</span><span className={`${blockClass} absolute inset-0`} />
      </span>
    </div>
  )
}

function BarChartSkeleton() {
  return (
    <div className="flex w-full flex-col gap-2" data-bar-chart-skeleton="">
      <span className={`${blockClass} h-4 w-1/2`} />
      <span className={`${blockClass} h-24 w-full`} />
      <span className={`${blockClass} h-3 w-full`} />
    </div>
  )
}

function GridSkeleton({ rows, cols, cell, gap }: Readonly<Extract<SkeletonProps, { variant: 'grid' }>>) {
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: cols === 1 ? `minmax(0, ${cell}px)` : `repeat(${cols}, ${cell}px)`,
        justifyContent: cols === 1 ? 'center' : undefined,
        gridTemplateRows: `repeat(${rows}, ${cell}px)`,
        gap,
      }}
      data-rows={rows}
      data-cols={cols}
      data-cell={cell}
      data-gap={gap}
    >
      {Array.from({ length: rows * cols }, (_, index) => (
        <span key={index} className={blockClass} style={{ width: cell, maxWidth: '100%', height: cell }} />
      ))}
    </div>
  )
}

/** One accessible placeholder unit shaped like the content that replaces it, or decoration inside a grouped one. */
export function Skeleton(props: Readonly<SkeletonProps>) {
  return (
    <div
      aria-busy={props.grouped ? undefined : true}
      aria-label={props.label}
      aria-hidden={props.grouped ? true : undefined}
      role={props.grouped ? undefined : 'progressbar'}
      data-variant={props.variant}
      className="w-full"
    >
      {props.variant === 'habit-row' ? <HabitRowSkeleton /> : null}
      {props.variant === 'settings' ? <SettingsSkeleton rows={props.rows} /> : null}
      {props.variant === 'stat-tile' ? <StatTileSkeleton /> : null}
      {props.variant === 'bar-chart' ? <BarChartSkeleton /> : null}
      {props.variant === 'grid' ? <GridSkeleton {...props} /> : null}
    </div>
  )
}
