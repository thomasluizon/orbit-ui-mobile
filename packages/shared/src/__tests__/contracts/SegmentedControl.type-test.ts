import type { SegmentedControlProps, SegmentedControlOption } from '../../contracts/navigation'
export type OptionKeys = AssertKeys<keyof SegmentedControlOption<'all'>, 'value' | 'label' | 'disabled'>
export type ExpectedOptionKeys = AssertKeys<'value' | 'label' | 'disabled', keyof SegmentedControlOption<'all'>>
type AssertKeys<TActual extends TExpected, TExpected> = TActual

export type ActualKeys = AssertKeys<keyof SegmentedControlProps<'all' | 'active'>, 'value' | 'options' | 'onChange' | 'label' | 'disabled'>
export type ExpectedKeys = AssertKeys<'value' | 'options' | 'onChange' | 'label' | 'disabled', keyof SegmentedControlProps<'all' | 'active'>>
export const valid: SegmentedControlProps<'all' | 'active'> = { value: 'all', options: [{ value: 'all', label: 'All' }], onChange: () => {}, label: 'Views' }
// @ts-expect-error forbidden contract shape
export const forbidden0: SegmentedControlProps<'all' | 'active'> = { value: 'all', options: [{ value: 'all', label: 'All' }], label: 'Views' }
// @ts-expect-error forbidden contract shape
export const forbidden1: SegmentedControlProps<'all' | 'active'> = { options: [{ value: 'all', label: 'All' }], onChange: () => {}, label: 'Views' }
// @ts-expect-error forbidden contract shape
export const forbidden2: SegmentedControlProps<'all' | 'active'> = { value: 'all', options: [{ value: 'all', label: 'All' }], onChange: () => {} }
// @ts-expect-error forbidden contract shape
export const forbidden3: SegmentedControlProps<'all' | 'active'> = { value: 'all', options: [{ value: 'all' }], onChange: () => {}, label: 'Views' }
// @ts-expect-error forbidden contract shape
export const forbidden4: SegmentedControlProps<'all' | 'active'> = { value: 'unknown', options: [{ value: 'all', label: 'All' }], onChange: () => {}, label: 'Views' }
// @ts-expect-error forbidden contract shape
export const forbidden5: SegmentedControlProps<'all' | 'active'> = { value: 'all', options: [{ value: 'all', label: 'All' }], onChange: () => {}, label: 'Views', variant: 'filled' }
// @ts-expect-error forbidden contract shape
export const forbidden6: SegmentedControlProps<'all' | 'active'> = { value: 'all', options: [{ value: 'all', label: 'All' }], onChange: () => {}, label: 'Views', fill: 'filled' }

declare function acceptInferred<TValue extends string>(props: SegmentedControlProps<TValue>): void
acceptInferred({ options: [{ value: 'all', label: 'All' }], value: 'all', onChange: () => {}, label: 'Views' })
// @ts-expect-error the selected value must be inferred only from the options
acceptInferred({ options: [{ value: 'all', label: 'All' }], value: 'unknown', onChange: () => {}, label: 'Views' })
