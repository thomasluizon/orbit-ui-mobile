import type { SkeletonProps } from './Skeleton'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T
type ExpectedSkeletonGap = 0 | 4 | 8 | 12 | 16 | 24 | 32 | 48 | 64 | 96

type RowVariant = Extract<SkeletonProps, { rows?: never; label: string; grouped?: never }>
type GridVariant = Extract<SkeletonProps, { variant: 'grid'; label: string; grouped?: never }>
type ExpectedRowVariant = {
  variant: 'habit-row' | 'settings' | 'stat-tile'
  label: string
  grouped?: never
  rows?: never
  cols?: never
  cell?: never
  gap?: never
}
type ExpectedGridVariant = {
  variant: 'grid'
  label: string
  grouped?: never
  rows: number
  cols: number
  cell: number
  gap: ExpectedSkeletonGap
}

export type SkeletonTypeContract = [
  Assert<IsExactWidth<RowVariant, ExpectedRowVariant>>,
  Assert<IsExactWidth<GridVariant, ExpectedGridVariant>>,
  Assert<IsExactWidth<SkeletonProps['variant'], ExpectedRowVariant['variant'] | 'grid'>>,
  Assert<IsExactWidth<SkeletonProps['label'], string | undefined>>,
  Assert<IsExactWidth<SkeletonProps['grouped'], true | undefined>>,
  Assert<IsExactWidth<SkeletonProps['rows'], number | undefined>>,
  Assert<IsExactWidth<SkeletonProps['cols'], number | undefined>>,
  Assert<IsExactWidth<SkeletonProps['cell'], number | undefined>>,
  Assert<IsExactWidth<SkeletonProps['gap'], ExpectedSkeletonGap | undefined>>,
  Assert<IsExact<{ variant: 'habit-row'; label: 'Loading habits' }, SkeletonProps>>,
  Assert<IsExact<{ variant: 'settings'; label: 'Loading settings' }, SkeletonProps>>,
  Assert<IsExact<{ variant: 'stat-tile'; label: 'Loading stats' }, SkeletonProps>>,
  Assert<IsExact<{ variant: 'grid'; label: 'Loading calendar'; rows: 6; cols: 7; cell: 40; gap: 8 }, SkeletonProps>>,
  Assert<IsExact<{ variant: 'stat-tile'; grouped: true }, SkeletonProps>>,
  // @ts-expect-error a skeleton is named or grouped, never both
  Assert<IsExact<{ variant: 'stat-tile'; label: 'Loading stats'; grouped: true }, SkeletonProps>>,
  // @ts-expect-error every skeleton is either named or grouped
  Assert<IsExact<{ variant: 'settings' }, SkeletonProps>>,
  // @ts-expect-error variant is a closed four-value set
  Assert<IsExact<{ variant: 'card'; label: 'Loading' }, SkeletonProps>>,
  // @ts-expect-error skeletons cannot opt into a spinner
  Assert<IsExact<{ variant: 'settings'; label: 'Loading'; spinner: true }, SkeletonProps>>,
  // @ts-expect-error skeletons cannot opt into a shimmer
  Assert<IsExact<{ variant: 'settings'; label: 'Loading'; shimmer: true }, SkeletonProps>>,
  // @ts-expect-error skeletons cannot select another animation
  Assert<IsExact<{ variant: 'settings'; label: 'Loading'; animation: 'sweep' }, SkeletonProps>>,
  // @ts-expect-error skeletons cannot select a duration
  Assert<IsExact<{ variant: 'settings'; label: 'Loading'; duration: 1000 }, SkeletonProps>>,
  // @ts-expect-error grid requires rows
  Assert<IsExact<{ variant: 'grid'; label: 'Loading'; cols: 7; cell: 40; gap: 8 }, SkeletonProps>>,
  // @ts-expect-error grid requires cols
  Assert<IsExact<{ variant: 'grid'; label: 'Loading'; rows: 6; cell: 40; gap: 8 }, SkeletonProps>>,
  // @ts-expect-error grid requires cell
  Assert<IsExact<{ variant: 'grid'; label: 'Loading'; rows: 6; cols: 7; gap: 8 }, SkeletonProps>>,
  // @ts-expect-error grid requires gap
  Assert<IsExact<{ variant: 'grid'; label: 'Loading'; rows: 6; cols: 7; cell: 40 }, SkeletonProps>>,
  // @ts-expect-error non-grid variants reject rows
  Assert<IsExact<{ variant: 'settings'; label: 'Loading'; rows: 2 }, SkeletonProps>>,
  // @ts-expect-error non-grid variants reject cols
  Assert<IsExact<{ variant: 'settings'; label: 'Loading'; cols: 2 }, SkeletonProps>>,
  // @ts-expect-error non-grid variants reject cell
  Assert<IsExact<{ variant: 'settings'; label: 'Loading'; cell: 40 }, SkeletonProps>>,
  // @ts-expect-error non-grid variants reject gap
  Assert<IsExact<{ variant: 'settings'; label: 'Loading'; gap: 8 }, SkeletonProps>>,
  // @ts-expect-error gap is limited to the spacing scale
  Assert<IsExact<{ variant: 'grid'; label: 'Loading'; rows: 6; cols: 7; cell: 40; gap: 10 }, SkeletonProps>>,
]
