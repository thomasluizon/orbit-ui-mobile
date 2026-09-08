import type { ReactNode } from 'react'
import type { ButtonProps } from './Button'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T
type Fields<T> = { [TKey in keyof T]: T[TKey] }

type LabelledVariant = Extract<ButtonProps, { iconOnly?: never }>
type IconOnlyVariant = Extract<ButtonProps, { iconOnly: true }>
type ExpectedButtonBase = {
  variant?: 'primary' | 'ghost' | 'secondary' | 'destructive' | 'caution'
  size?: 'md' | 'sm'
  loading?: boolean
  disabled?: boolean
  onClick?: () => void
  formId?: string
}
type ExpectedLabelledVariant = ExpectedButtonBase & {
  children: string
  accessibleName?: string
  iconOnly?: never
  label?: never
}
type ExpectedIconOnlyVariant = ExpectedButtonBase & {
  children: ReactNode
  iconOnly: true
  label: string
  accessibleName?: never
}

export type ButtonTypeContract = [
  Assert<IsExactWidth<Fields<LabelledVariant>, Fields<ExpectedLabelledVariant>>>,
  Assert<IsExactWidth<Fields<IconOnlyVariant>, Fields<ExpectedIconOnlyVariant>>>,
  Assert<IsExactWidth<ButtonProps['variant'], ExpectedButtonBase['variant']>>,
  Assert<IsExactWidth<ButtonProps['size'], ExpectedButtonBase['size']>>,
  Assert<IsExactWidth<ButtonProps['loading'], boolean | undefined>>,
  Assert<IsExactWidth<ButtonProps['disabled'], boolean | undefined>>,
  Assert<IsExactWidth<ButtonProps['onClick'], (() => void) | undefined>>,
  Assert<IsExactWidth<ButtonProps['formId'], string | undefined>>,
  Assert<IsExactWidth<ButtonProps['children'], ReactNode>>,
  Assert<IsExactWidth<ButtonProps['accessibleName'], string | undefined>>,
  Assert<IsExactWidth<ButtonProps['iconOnly'], true | undefined>>,
  Assert<IsExactWidth<ButtonProps['label'], string | undefined>>,
  Assert<IsExact<{ children: 'Continue'; variant: 'primary'; size: 'md' }, ButtonProps>>,
  Assert<IsExact<{ children: 'Continue'; variant: 'ghost'; size: 'sm' }, ButtonProps>>,
  Assert<IsExact<{ children: 'Continue'; variant: 'secondary' }, ButtonProps>>,
  Assert<IsExact<{ children: 'Continue'; variant: 'destructive' }, ButtonProps>>,
  Assert<IsExact<{ children: 'Continue'; variant: 'caution' }, ButtonProps>>,
  Assert<IsExact<{ children: 'icon'; iconOnly: true; label: 'Back' }, ButtonProps>>,
  Assert<IsExact<{ children: 'Create'; formId: 'create-habit-form' }, ButtonProps>>,
  // @ts-expect-error a sixth variant is not representable
  Assert<IsExact<{ children: 'Continue'; variant: 'accent' }, ButtonProps>>,
  // @ts-expect-error large is outside the button scale
  Assert<IsExact<{ children: 'Continue'; size: 'lg' }, ButtonProps>>,
  // @ts-expect-error extra small is outside the button scale
  Assert<IsExact<{ children: 'Continue'; size: 'xs' }, ButtonProps>>,
  // @ts-expect-error icon-only buttons require an accessible name
  Assert<IsExact<{ children: 'icon'; iconOnly: true }, ButtonProps>>,
  // @ts-expect-error label is reserved for icon-only buttons
  Assert<IsExact<{ children: 'Continue'; label: 'Continue' }, ButtonProps>>,
  // @ts-expect-error iconOnly and label must be supplied together
  Assert<IsExact<{ children: 'Continue'; label: 'Continue'; iconOnly: false }, ButtonProps>>,
  // @ts-expect-error form ids are strings
  Assert<IsExact<{ children: 'Create'; formId: 42 }, ButtonProps>>,
]
