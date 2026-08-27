import type { ButtonProps } from './Button'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type Assert<T extends true> = T

export type ButtonTypeContract = [
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
