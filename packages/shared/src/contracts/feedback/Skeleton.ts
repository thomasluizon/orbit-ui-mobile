export type SkeletonGap = 0 | 4 | 8 | 12 | 16 | 24 | 32 | 48 | 64 | 96

/**
 * `label` names the placeholder to a screen reader. Pass `grouped` instead when several
 * placeholders stand for ONE thing that is loading, such as a row of stat tiles: each unit then
 * renders as decoration and the CALLER carries the single busy region and its name. Four
 * placeholders that each announce themselves are four announcements for one wait.
 */
export type SkeletonProps =
  | {
      variant: 'habit-row' | 'settings' | 'stat-tile'
      label: string
      grouped?: never
      rows?: never
      cols?: never
      cell?: never
      gap?: never
    }
  | {
      variant: 'habit-row' | 'settings' | 'stat-tile'
      grouped: true
      label?: never
      rows?: never
      cols?: never
      cell?: never
      gap?: never
    }
  | {
      variant: 'grid'
      label: string
      grouped?: never
      rows: number
      cols: number
      cell: number
      gap: SkeletonGap
    }
  | {
      variant: 'grid'
      grouped: true
      label?: never
      rows: number
      cols: number
      cell: number
      gap: SkeletonGap
    }
