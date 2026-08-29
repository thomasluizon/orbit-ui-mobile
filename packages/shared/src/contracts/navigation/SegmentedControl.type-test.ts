import type { SegmentedControlProps } from './SegmentedControl'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type Assert<T extends true> = T

export type SegmentedControlTypeContract = [
  Assert<
    IsExact<
      {
        options: readonly [{ id: 'all'; label: 'All' }, { id: 'active'; label: 'Active' }]
        value: 'all'
        onChange: (id: string) => void
        label: 'Goal views'
      },
      SegmentedControlProps
    >
  >,
  // @ts-expect-error one option is not a segmented control
  Assert<IsExact<{ options: readonly [{ id: 'all'; label: 'All' }]; value: 'all'; onChange: (id: string) => void; label: 'Views' }, SegmentedControlProps>>,
  // @ts-expect-error five options exceed the decision ceiling
  Assert<IsExact<{ options: readonly [{ id: 'a'; label: 'A' }, { id: 'b'; label: 'B' }, { id: 'c'; label: 'C' }, { id: 'd'; label: 'D' }, { id: 'e'; label: 'E' }]; value: 'a'; onChange: (id: string) => void; label: 'Views' }, SegmentedControlProps>>,
  // @ts-expect-error an accessible group label is required
  Assert<IsExact<{ options: readonly [{ id: 'a'; label: 'A' }, { id: 'b'; label: 'B' }]; value: 'a'; onChange: (id: string) => void }, SegmentedControlProps>>,
]
