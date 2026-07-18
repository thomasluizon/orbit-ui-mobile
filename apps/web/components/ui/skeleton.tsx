interface SkeletonLineProps {
  width?: string
  height?: string
  className?: string
}

interface SkeletonCardProps {
  lines?: number
  className?: string
}

interface SkeletonRowProps {
  /** Shape of the leading placeholder: a round avatar, a rounded icon square, or nothing. */
  media?: 'avatar' | 'square' | 'none'
  /** Tailwind width class per placeholder line. The first line renders taller, as a title would. */
  lineWidths?: readonly string[]
  className?: string
}

interface SkeletonHabitRowProps {
  className?: string
}

const SKELETON_FILL = 'skeleton-pulse bg-[color-mix(in_srgb,var(--fg-1)_6%,transparent)]'

const DEFAULT_ROW_LINES = ['w-1/3', 'w-2/3'] as const

/** Loading placeholder line: fg-1 6% tint block with a calm opacity pulse, no gradient shimmer. */
export function SkeletonLine({ width, height, className }: Readonly<SkeletonLineProps>) {
  return (
    <div
      className={[
        SKELETON_FILL,
        'rounded-[var(--radius-md)]',
        height ?? 'h-3',
        width ?? 'w-full',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    />
  )
}

function cardLineShape(index: number, total: number): { width: string; height: string } {
  if (index === 0) return { width: 'w-1/3', height: 'h-4' }
  if (index === total - 1) return { width: 'w-2/3', height: 'h-3' }
  return { width: 'w-full', height: 'h-3' }
}

/**
 * Loading placeholder shaped like a list row: an optional leading avatar or icon square plus
 * title and meta lines, so a list does not shift when its data lands.
 */
export function SkeletonRow({
  media = 'avatar',
  lineWidths = DEFAULT_ROW_LINES,
  className,
}: Readonly<SkeletonRowProps>) {
  return (
    <div
      className={['flex min-w-0 items-center gap-3 px-5 py-3', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      data-skeleton-row={media}
    >
      {media === 'avatar' ? <span className={`${SKELETON_FILL} size-10 shrink-0 rounded-full`} /> : null}
      {media === 'square' ? (
        <span className={`${SKELETON_FILL} size-[26px] shrink-0 rounded-[8px]`} />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {lineWidths.map((width, index) => (
          <SkeletonLine key={index} width={width} height={index === 0 ? 'h-4' : 'h-3'} />
        ))}
      </div>
    </div>
  )
}

/**
 * Loading placeholder shaped like a Today / all / general habit row: the emoji well, a title and
 * meta line, and the trailing status-dot, inside the row's own card surface — so the list keeps the
 * final content's dimensions and nothing shifts when habits land (DESIGN.md loading contract).
 */
export function SkeletonHabitRow({ className }: Readonly<SkeletonHabitRowProps>) {
  return (
    <div
      className={[
        'flex items-center gap-3 rounded-[18px] bg-[var(--bg-card)] px-4 py-3 shadow-[inset_0_0_0_1px_var(--hairline)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      <span className={`${SKELETON_FILL} size-12 shrink-0 rounded-[var(--radius-md)]`} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <SkeletonLine width="w-1/2" height="h-4" />
        <SkeletonLine width="w-1/3" height="h-3" />
      </div>
      <span className={`${SKELETON_FILL} size-7 shrink-0 rounded-full`} />
    </div>
  )
}

/** Loading placeholder shaped like a card: a tonal panel holding a title line and body lines. */
export function SkeletonCard({ lines = 3, className }: Readonly<SkeletonCardProps>) {
  return (
    <div
      className={[
        'flex flex-col gap-3 rounded-[18px] bg-[var(--bg-card)] p-4 shadow-[inset_0_0_0_1px_var(--hairline)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      {Array.from({ length: lines }, (_, index) => {
        const { width, height } = cardLineShape(index, lines)
        return <SkeletonLine key={index} width={width} height={height} />
      })}
    </div>
  )
}
