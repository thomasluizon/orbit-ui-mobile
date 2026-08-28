export type SkeletonGap = 0 | 4 | 8 | 12 | 16 | 24 | 32 | 48 | 64 | 96

export type SkeletonProps =
  | {
      variant: 'habit-row' | 'settings' | 'stat-tile'
      label: string
      rows?: never
      cols?: never
      cell?: never
      gap?: never
    }
  | {
      variant: 'grid'
      label: string
      rows: number
      cols: number
      cell: number
      gap: SkeletonGap
    }
