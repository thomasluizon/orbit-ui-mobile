import type { FreezeBankProps } from './FreezeBank'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type Assert<T extends true> = T

type Words = {
  active: 'active'
  frozen: 'frozen'
  missed: 'missed'
  today: 'today'
  legendLabel: 'Legend'
  disclosureCollapsed: 'Show freeze details'
  disclosureExpanded: 'Hide freeze details'
  bankedLabel: 'Banked'
  usedLabel: 'Used'
  nextLabel: 'Next freeze'
  nextProgressLabel: 'Freeze progress'
  nextFreezeInDays: 'Next freeze in 3 days'
  capacityMessage: 'The bank is full'
  protectedLabel: 'Protected days'
  protectedEmpty: 'No protected days'
  protectedDay: 'Protected'
  protectedToday: 'Protected today'
}

export type FreezeBankTypeContract = [
  Assert<
    IsExact<
      {
        banked: 1
        ceiling: 3
        usedThisMonth: 2
        monthlyUseCeiling: 3
        daysTowardNext: 4
        earnRateDays: 7
        tierValue: 'Silver'
        tierLabel: 'Streak tier'
        protectedDays: readonly []
        words: Words
      },
      FreezeBankProps
    >
  >,
  // @ts-expect-error the protected empty state requires caller-owned words
  Assert<IsExact<Omit<FreezeBankProps, 'words'>, FreezeBankProps>>,
  // @ts-expect-error the tier belongs inside the disclosure and is required
  Assert<IsExact<Omit<FreezeBankProps, 'tierValue'>, FreezeBankProps>>,
]
