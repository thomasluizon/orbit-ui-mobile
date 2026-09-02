export type DayOutcome = 'none' | 'partial' | 'full' | 'not-scheduled' | 'future' | 'unavailable'

export interface DayCellWords {
  none: string
  partial: string
  full: string
  notScheduled: string
  unavailable?: string
  future: string
  of: string
  today: string
  selected: string
  readOnly: string
}

interface DayCellBase {
  day: number
  done?: number
  scheduled?: number
  size?: number
  today?: boolean
  selected?: boolean
  outsideMonth?: boolean
  label?: string
  words: DayCellWords
}

export interface LoggableDayCellProps extends DayCellBase {
  loggable: true
  outcome?: Exclude<DayOutcome, 'future' | 'unavailable'>
  onPress: () => void
}

export interface ReadOnlyDayCellProps extends DayCellBase {
  loggable?: false
  outcome?: DayOutcome
  onPress?: never
}

export type DayCellProps = LoggableDayCellProps | ReadOnlyDayCellProps
