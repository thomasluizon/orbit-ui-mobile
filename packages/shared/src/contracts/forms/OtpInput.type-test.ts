import type { OtpInputProps } from './OtpInput'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U
  ? Exclude<keyof T, Keys<U>> extends never
    ? true
    : false
  : false
type Assert<T extends true> = T

export type OtpInputTypeContract = [
  Assert<IsExact<{ value: ''; onChange: () => void; label: 'Code' }, OtpInputProps>>,
  Assert<IsExact<{
    value: '123'
    onChange: () => void
    label: 'Code'
    length: 6
    error: 'Try again'
    hint: 'Expires soon'
    disabled: true
    autoFocus: true
    id: 'code'
    onComplete: () => void
  }, OtpInputProps>>,
  // @ts-expect-error onChange is required
  Assert<IsExact<{ value: ''; label: 'Code' }, OtpInputProps>>,
  // @ts-expect-error label is required
  Assert<IsExact<{ value: ''; onChange: () => void }, OtpInputProps>>,
  // @ts-expect-error active position is owned by the component
  Assert<IsExact<{ value: ''; onChange: () => void; label: 'Code'; activeIndex: 0 }, OtpInputProps>>,
]
