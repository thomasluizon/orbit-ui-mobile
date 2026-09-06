import type { SegmentedControlProps, SegmentedControlOption } from '../../contracts/navigation'
export type OptionKeys = AssertKeys<keyof SegmentedControlOption<'all'>, 'value' | 'label' | 'disabled'>
export type ExpectedOptionKeys = AssertKeys<'value' | 'label' | 'disabled', keyof SegmentedControlOption<'all'>>
type AssertKeys<TActual extends TExpected, TExpected> = TActual

export type ActualKeys = AssertKeys<keyof SegmentedControlProps<'all' | 'active'>, 'value' | 'options' | 'onChange' | 'label' | 'disabled'>
export type ExpectedKeys = AssertKeys<'value' | 'options' | 'onChange' | 'label' | 'disabled', keyof SegmentedControlProps<'all' | 'active'>>
export const valid: SegmentedControlProps<'all' | 'active'> = { value: 'all', options: [{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }], onChange: () => {}, label: 'Views' }
// @ts-expect-error forbidden contract shape
export const forbidden0: SegmentedControlProps<'all' | 'active'> = { value: 'all', options: [{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }], label: 'Views' }
// @ts-expect-error forbidden contract shape
export const forbidden1: SegmentedControlProps<'all' | 'active'> = { options: [{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }], onChange: () => {}, label: 'Views' }
// @ts-expect-error forbidden contract shape
export const forbidden2: SegmentedControlProps<'all' | 'active'> = { value: 'all', options: [{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }], onChange: () => {} }
// @ts-expect-error forbidden contract shape
export const forbidden3: SegmentedControlProps<'all' | 'active'> = { value: 'all', options: [{ value: 'all' }, { value: 'active', label: 'Active' }], onChange: () => {}, label: 'Views' }
// @ts-expect-error forbidden contract shape
export const forbidden4: SegmentedControlProps<'all' | 'active'> = { value: 'unknown', options: [{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }], onChange: () => {}, label: 'Views' }
// @ts-expect-error forbidden contract shape
export const forbidden5: SegmentedControlProps<'all' | 'active'> = { value: 'all', options: [{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }], onChange: () => {}, label: 'Views', variant: 'filled' }
// @ts-expect-error forbidden contract shape
export const forbidden6: SegmentedControlProps<'all' | 'active'> = { value: 'all', options: [{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }], onChange: () => {}, label: 'Views', fill: 'filled' }

declare function acceptInferred<TValue extends string>(props: SegmentedControlProps<TValue>): void
acceptInferred({ options: [{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }], value: 'all', onChange: () => {}, label: 'Views' })
// @ts-expect-error the selected value must be inferred only from the options
acceptInferred({ options: [{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }], value: 'unknown', onChange: () => {}, label: 'Views' })

const first = { value: 'all', label: 'All' } as const
const second = { value: 'active', label: 'Active' } as const
const third = { value: 'completed', label: 'Completed' } as const
const fourth = { value: 'archived', label: 'Archived' } as const
export const three: SegmentedControlProps<string> = { ...valid, onChange: () => {}, options: [first, second, third] }
export const four: SegmentedControlProps<string> = { ...valid, onChange: () => {}, options: [first, second, third, fourth] }
// @ts-expect-error a view switcher requires at least two options
export const empty: SegmentedControlProps<string> = { ...valid, onChange: () => {}, options: [] }
// @ts-expect-error one option is not a view switcher
export const single: SegmentedControlProps<string> = { ...valid, onChange: () => {}, options: [first] }
// @ts-expect-error a view switcher has at most four options
export const five: SegmentedControlProps<string> = { ...valid, onChange: () => {}, options: [first, second, third, fourth, { value: 'fifth', label: 'Fifth' }] }
// @ts-expect-error an unbounded array cannot prove the option count
export const unbounded: SegmentedControlProps<string> = { ...valid, onChange: () => {}, options: [] as SegmentedControlOption<string>[] }
// @ts-expect-error undefined is not an optional third option
export const missingThird: SegmentedControlProps<string> = { ...valid, onChange: () => {}, options: [first, second, undefined] }

export type OptionCounts = AssertKeys<SegmentedControlProps<string>['options']['length'], 2 | 3 | 4>
export type ExpectedOptionCounts = AssertKeys<2 | 3 | 4, SegmentedControlProps<string>['options']['length']>
