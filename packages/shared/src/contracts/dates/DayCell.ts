export type DayOutcome = 'none' | 'partial' | 'full' | 'not-scheduled'

export interface DayCellWords {
  none: string
  partial: string
  full: string
  notScheduled: string
  of: string
  today: string
  readOnly: string
}

interface DayCellBase {
  day: number
  done?: number
  scheduled?: number
  size?: number
  today?: boolean
  /** The parent owns selection presentation; retained for composed-cell compatibility. */
  selectionTintedByParent?: boolean
  outsideMonth?: boolean
  label?: string
  habitHistory?: boolean
  words: DayCellWords
}

export interface LoggableDayCellProps extends DayCellBase {
  loggable: true
  onPress: () => void
}

export interface ReadOnlyDayCellProps extends DayCellBase {
  loggable?: false
  onPress?: never
}

export type DayCellProps = LoggableDayCellProps | ReadOnlyDayCellProps
