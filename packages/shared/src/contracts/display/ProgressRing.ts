/** True circle with a sweep over a track (deliberately not the logo's tilted-ellipse shape). Accent while unfinished; at 100% the sweep goes neutral. */
export interface ProgressRingProps {
  value?: number
  size?: number
  label?: string
  /** The duration of a value change: `base` by default, `slow` for the one sweep of a value that changed since the person last saw it. */
  sweepDuration?: 'base' | 'slow'
}
