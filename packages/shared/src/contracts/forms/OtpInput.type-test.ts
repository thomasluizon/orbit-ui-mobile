import type { OtpInputProps } from './OtpInput'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U
  ? Exclude<keyof T, Keys<U>> extends never
    ? true
    : false
  : false
type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T

export type OtpInputTypeContract = [
  Assert<IsExactWidth<OtpInputProps['length'], number | undefined>>,
  Assert<IsExactWidth<OtpInputProps['value'], string>>,
  Assert<IsExactWidth<OtpInputProps['onChange'], (value: string) => void>>,
  Assert<IsExactWidth<OtpInputProps['onComplete'], ((value: string) => void) | undefined>>,
  Assert<IsExactWidth<OtpInputProps['error'], string | undefined>>,
  Assert<IsExactWidth<OtpInputProps['hint'], string | undefined>>,
  Assert<IsExactWidth<OtpInputProps['disabled'], boolean | undefined>>,
  Assert<IsExactWidth<OtpInputProps['autoFocus'], boolean | undefined>>,
  Assert<IsExactWidth<OtpInputProps['label'], string>>,
  Assert<IsExactWidth<OtpInputProps['id'], string | undefined>>,
  Assert<IsExactWidth<OtpInputProps['name'], string | undefined>>,
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
