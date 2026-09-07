import type { SegmentedControlOption, SegmentedControlProps } from './SegmentedControl'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type Assert<T extends true> = T

type Value = 'all' | 'active' | 'done' | 'archived'
type All = { value: 'all'; label: 'All' }
type Active = { value: 'active'; label: 'Active' }
type Done = { value: 'done'; label: 'Done' }
type Archived = { value: 'archived'; label: 'Archived' }
type TwoOptions = { options: readonly [All, Active]; value: 'all'; onChange: (value: 'all' | 'active') => void; label: 'View' }
type ThreeOptions = { options: readonly [All, Active, Done]; value: 'done'; onChange: (value: 'all' | 'active' | 'done') => void; label: 'View' }
type FourOptions = { options: readonly [All, Active, Done, Archived]; value: 'archived'; onChange: (value: Value) => void; label: 'View' }
type ExpectedKeys = 'options' | 'value' | 'onChange' | 'label' | 'disabled'

export type SegmentedControlTypeContract = [
  Assert<IsExact<TwoOptions, SegmentedControlProps<'all' | 'active'>>>,
  Assert<IsExact<ThreeOptions, SegmentedControlProps<'all' | 'active' | 'done'>>>,
  Assert<IsExact<FourOptions, SegmentedControlProps<Value>>>,
  Assert<IsExact<All, SegmentedControlOption<Value>>>,
  Assert<IsExact<Active & { disabled: true }, SegmentedControlOption<Value>>>,
  Assert<IsExact<Omit<TwoOptions, 'options'> & { options: readonly [All, Active & { disabled: true }] }, SegmentedControlProps<'all' | 'active'>>>,
  Assert<IsExact<TwoOptions & { disabled: true }, SegmentedControlProps<'all' | 'active'>>>,
  Assert<Exclude<Keys<SegmentedControlProps<Value>>, ExpectedKeys> extends never ? true : false>,
  Assert<Exclude<ExpectedKeys, Keys<SegmentedControlProps<Value>>> extends never ? true : false>,
  Assert<Exclude<Keys<SegmentedControlOption<Value>>, 'value' | 'label' | 'disabled'> extends never ? true : false>,
  Assert<Exclude<'value' | 'label' | 'disabled', Keys<SegmentedControlOption<Value>>> extends never ? true : false>,
  // @ts-expect-error one option is not a view switcher
  Assert<IsExact<Omit<TwoOptions, 'options'> & { options: readonly [All] }, SegmentedControlProps<'all' | 'active'>>>,
  // @ts-expect-error five options exceed the view switcher contract
  Assert<IsExact<Omit<FourOptions, 'options'> & { options: readonly [All, Active, Done, Archived, All] }, SegmentedControlProps<Value>>>,
  // @ts-expect-error the current value must belong to the option values
  Assert<IsExact<Omit<TwoOptions, 'value'> & { value: 'done' }, SegmentedControlProps<TwoOptions['options'][number]['value']>>>,
  // @ts-expect-error the handler must accept every option value
  Assert<IsExact<Omit<TwoOptions, 'onChange'> & { onChange: (value: 'done') => void }, SegmentedControlProps<TwoOptions['options'][number]['value']>>>,
  // @ts-expect-error a read only segmented control is not representable
  Assert<IsExact<Omit<TwoOptions, 'onChange'>, SegmentedControlProps<'all' | 'active'>>>,
  // @ts-expect-error a segmented control always has a current position
  Assert<IsExact<Omit<TwoOptions, 'value'>, SegmentedControlProps<'all' | 'active'>>>,
  // @ts-expect-error a segmented control requires an accessible group name
  Assert<IsExact<Omit<TwoOptions, 'label'>, SegmentedControlProps<'all' | 'active'>>>,
  // @ts-expect-error options require the caller's words
  Assert<IsExact<{ value: 'all' }, SegmentedControlOption<Value>>>,
  // @ts-expect-error option disabled state is a boolean
  Assert<IsExact<Active & { disabled: 'all' }, SegmentedControlOption<Value>>>,
  // @ts-expect-error control disabled state is a boolean
  Assert<IsExact<TwoOptions & { disabled: 'active' }, SegmentedControlProps<'all' | 'active'>>>,
]
