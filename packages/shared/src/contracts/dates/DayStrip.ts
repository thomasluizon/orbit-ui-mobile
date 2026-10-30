export type HabitDayValue = 'done' | 'missed' | 'not-scheduled'
export type AccountDayValue = 'active' | 'frozen' | 'missed' | 'today' | 'not-scheduled'

export interface HabitDayWords {
  done: string
  missed: string
  notScheduled: string
}

export interface AccountDayWords {
  notScheduled: string
  active: string
  frozen: string
  missed: string
  today: string
}

interface DayStripBase {
  length?: number
  labels?: string[]
  size?: number
  label: string
}

export interface HabitDayStripProps extends DayStripBase {
  scope: 'habit'
  days: HabitDayValue[]
  words: HabitDayWords
}

export interface AccountDayStripProps extends DayStripBase {
  scope: 'account'
  days: AccountDayValue[]
  words: AccountDayWords
}

export type DayStripProps = HabitDayStripProps | AccountDayStripProps
