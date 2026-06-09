interface SkeletonLineProps {
  width?: string
  height?: string
  className?: string
}

interface SkeletonCardProps {
  lines?: number
  className?: string
}

export function SkeletonLine({ width, height, className }: Readonly<SkeletonLineProps>) {
  return (
    <div
      className={[
        'skeleton-pulse bg-[var(--bg-elev)] rounded-[var(--radius-sm)]',
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

export function SkeletonCard({ lines = 3, className }: Readonly<SkeletonCardProps>) {
  const lineWidths = (index: number, total: number): { width: string; height: string } => {
    if (index === 0) return { width: 'w-1/3', height: 'h-4' }
    if (index === total - 1) return { width: 'w-2/3', height: 'h-3' }
    return { width: 'w-full', height: 'h-3' }
  }

  return (
    <div
      className={[
        'bg-[var(--bg-elev)] rounded-[12px] border border-[var(--hairline)] p-5 space-y-3',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      {Array.from({ length: lines }, (_, i) => {
        const { width, height } = lineWidths(i, lines)
        return <SkeletonLine key={i} width={width} height={height} />
      })}
    </div>
  )
}

