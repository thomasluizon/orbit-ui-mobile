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

function SettingsSkeleton() {
  return (
    <div className="flex h-[52px] items-center gap-3 px-4">
      <span className={`${blockClass} size-6 shrink-0`} />
      <span className="flex flex-1 flex-col gap-2">
        <span className={`${blockClass} h-4 w-1/2`} />
        <span className={`${blockClass} h-3 w-2/3`} />
      </span>
      <span className={`${blockClass} h-4 w-12 shrink-0`} />
    </div>
  )
}

function StatTileSkeleton() {
  return (
    <div className="flex min-h-[110px] flex-col gap-3 rounded-[var(--r-card)] bg-[var(--bg-card)] p-6 shadow-[inset_0_0_0_1px_var(--hairline)]">
      <span className={`${blockClass} h-6 w-1/2`} />
      <span className={`${blockClass} h-4 w-2/3`} />
    </div>
  )
}

function GridSkeleton({ cols, cell, gap }: Readonly<Extract<SkeletonProps, { variant: 'grid' }>>) {
  return (
    <div
      className="grid h-full"
      style={{ gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gap }}
      data-cols={cols}
      data-cell={cell}
      data-gap={gap}
    >
      {Array.from({ length: cols }, (_, index) => (
        <span key={index} className={blockClass} style={{ width: cell, height: cell }} />
      ))}
    </div>
  )
}

/** One accessible placeholder unit shaped like the content that replaces it. */
export function Skeleton(props: Readonly<SkeletonProps>) {
  return (
    <div
      aria-busy="true"
      aria-label={props.label}
      data-variant={props.variant}
      className="w-full"
    >
      {props.variant === 'habit-row' ? <HabitRowSkeleton /> : null}
      {props.variant === 'settings' ? <SettingsSkeleton /> : null}
      {props.variant === 'stat-tile' ? <StatTileSkeleton /> : null}
      {props.variant === 'grid' ? <GridSkeleton {...props} /> : null}
    </div>
  )
}
