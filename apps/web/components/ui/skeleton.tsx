interface SkeletonLineProps {
  width?: string
  height?: string
  className?: string
}

interface SkeletonCardProps {
  lines?: number
  className?: string
}

interface SkeletonAvatarProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const avatarSizeClasses: Record<NonNullable<SkeletonAvatarProps['size']>, string> = {
  sm: 'size-8',
  md: 'size-10',
  lg: 'size-14',
}

export function SkeletonLine({ width, height, className }: SkeletonLineProps) {
  return (
    <div
      className={[
        'skeleton-shimmer rounded-[var(--radius-sm)]',
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

export function SkeletonCard({ lines = 3, className }: SkeletonCardProps) {
  const lineWidths = (index: number, total: number): { width: string; height: string } => {
    if (index === 0) return { width: 'w-1/3', height: 'h-4' }
    if (index === total - 1) return { width: 'w-2/3', height: 'h-3' }
    return { width: 'w-full', height: 'h-3' }
  }

  return (
    <div
      className={[
        'bg-surface rounded-[var(--radius-xl)] border border-border-muted p-5 space-y-3',
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

export function SkeletonAvatar({ size = 'md', className }: SkeletonAvatarProps) {
  return (
    <div
      className={['skeleton-shimmer rounded-full', avatarSizeClasses[size], className]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    />
  )
}
