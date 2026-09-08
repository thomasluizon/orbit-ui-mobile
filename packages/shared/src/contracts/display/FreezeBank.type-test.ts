import type {
  FreezeBankProps,
  FreezeBankProtectedDay,
  FreezeBankWords,
} from './FreezeBank'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T

type Words = {
  active: 'active'
  frozen: 'frozen'
  missed: 'missed'
  today: 'today'
  legendLabel: 'Legend'
  bankedLabel: 'Banked'
  usedLabel: 'Used'
  nextLabel: 'Next freeze'
  nextProgressLabel: 'Freeze progress'
  nextFreezeProgress: 'Next freeze in 3 days'
  protectedLabel: 'Protected days'
  protectedEmpty: 'No protected days'
  protectedDay: 'Protected'
  protectedToday: 'Protected today'
}

export type FreezeBankTypeContract = [
  Assert<IsExactWidth<FreezeBankProtectedDay['id'], string>>,
  Assert<IsExactWidth<FreezeBankProtectedDay['dateLabel'], string>>,
  Assert<IsExactWidth<FreezeBankProtectedDay['isToday'], boolean | undefined>>,
  Assert<IsExactWidth<FreezeBankWords['active'], string>>,
  Assert<IsExactWidth<FreezeBankWords['frozen'], string>>,
  Assert<IsExactWidth<FreezeBankWords['missed'], string>>,
  Assert<IsExactWidth<FreezeBankWords['today'], string>>,
  Assert<IsExactWidth<FreezeBankWords['legendLabel'], string>>,
  Assert<IsExactWidth<FreezeBankWords['bankedLabel'], string>>,
  Assert<IsExactWidth<FreezeBankWords['usedLabel'], string>>,
  Assert<IsExactWidth<FreezeBankWords['nextLabel'], string>>,
  Assert<IsExactWidth<FreezeBankWords['nextProgressLabel'], string>>,
  Assert<IsExactWidth<FreezeBankWords['nextFreezeProgress'], string>>,
  Assert<IsExactWidth<FreezeBankWords['protectedLabel'], string>>,
  Assert<IsExactWidth<FreezeBankWords['protectedEmpty'], string>>,
  Assert<IsExactWidth<FreezeBankWords['protectedDay'], string>>,
  Assert<IsExactWidth<FreezeBankWords['protectedToday'], string>>,
  Assert<IsExactWidth<FreezeBankProps['banked'], number>>,
  Assert<IsExactWidth<FreezeBankProps['ceiling'], number>>,
  Assert<IsExactWidth<FreezeBankProps['usedThisMonth'], number>>,
  Assert<IsExactWidth<FreezeBankProps['daysTowardNext'], number>>,
  Assert<IsExactWidth<FreezeBankProps['earnRateDays'], number>>,
  Assert<IsExactWidth<FreezeBankProps['tierValue'], string>>,
  Assert<IsExactWidth<FreezeBankProps['tierLabel'], string>>,
  Assert<IsExactWidth<FreezeBankProps['longestValue'], number>>,
  Assert<IsExactWidth<FreezeBankProps['longestLabel'], string>>,
  Assert<IsExactWidth<FreezeBankProps['protectedDays'], readonly FreezeBankProtectedDay[]>>,
  Assert<IsExactWidth<FreezeBankProps['words'], FreezeBankWords>>,
  Assert<
    IsExact<
      {
        banked: 1
        ceiling: 3
        usedThisMonth: 2
        daysTowardNext: 4
        earnRateDays: 7
        tierValue: 'Silver'
        tierLabel: 'Streak tier'
        longestValue: 21
        longestLabel: 'Best streak'
        protectedDays: readonly []
        words: Words
      },
      FreezeBankProps
    >
  >,
  // @ts-expect-error the protected empty state requires caller-owned words
  Assert<IsExact<Omit<FreezeBankProps, 'words'>, FreezeBankProps>>,
  // @ts-expect-error the streak tier is required
  Assert<IsExact<Omit<FreezeBankProps, 'tierValue'>, FreezeBankProps>>,
]
