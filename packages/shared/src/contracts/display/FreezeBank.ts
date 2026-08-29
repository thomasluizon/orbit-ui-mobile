import type { AccountDayWords } from '../dates/DayStrip'

export interface FreezeBankProtectedDay {
  id: string
  dateLabel: string
  isToday?: boolean
}

export interface FreezeBankWords extends AccountDayWords {
  legendLabel: string
  disclosureCollapsed: string
  disclosureExpanded: string
  bankedLabel: string
  usedLabel: string
  nextLabel: string
  nextProgressLabel: string
  nextFreezeInDays: string
  capacityMessage: string
  protectedLabel: string
  protectedEmpty: string
  protectedDay: string
  protectedToday: string
}

export interface FreezeBankProps {
  banked: number
  ceiling: number
  usedThisMonth: number
  monthlyUseCeiling: number
  daysTowardNext: number
  earnRateDays: number
  tierValue: string
  tierLabel: string
  protectedDays: readonly FreezeBankProtectedDay[]
  words: FreezeBankWords
  defaultExpanded?: boolean
}
