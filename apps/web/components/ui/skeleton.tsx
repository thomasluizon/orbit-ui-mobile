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
        'skeleton-pulse bg-[color-mix(in_srgb,var(--fg-1)_6%,transparent)] rounded-[var(--radius-md)]',
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
        'bg-[var(--bg-card)] rounded-[16px] shadow-[inset_0_0_0_1px_var(--hairline)] p-5 space-y-3',
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

