import type { ProgressBarProps } from './ProgressBar'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T

export type ProgressBarTypeContract = [
  Assert<IsExactWidth<ProgressBarProps['value'], number | undefined>>,
  Assert<IsExactWidth<ProgressBarProps['max'], number | undefined>>,
  Assert<IsExactWidth<ProgressBarProps['label'], string | undefined>>,
  Assert<IsExact<{ value: 5; max: 10; label: 'Half complete' }, ProgressBarProps>>,
  // @ts-expect-error the bar derives its own color
  Assert<IsExact<{ color: 'orange' }, ProgressBarProps>>,
  // @ts-expect-error the bar has no tone axis
  Assert<IsExact<{ tone: 'positive' }, ProgressBarProps>>,
  // @ts-expect-error the bar has no variant axis
  Assert<IsExact<{ variant: 'success' }, ProgressBarProps>>,
]
