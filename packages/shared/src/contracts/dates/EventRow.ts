interface EventRowBase {
  title: string
  source?: string
  onClick?: () => void
}

export interface TimedEventRowProps extends EventRowBase {
  time: string
  allDayLabel?: never
}

export interface AllDayEventRowProps extends EventRowBase {
  time?: never
  allDayLabel: string
}

export type EventRowProps = TimedEventRowProps | AllDayEventRowProps
