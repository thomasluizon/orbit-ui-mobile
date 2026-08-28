import type { SkeletonProps } from './Skeleton'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type Assert<T extends true> = T

export type SkeletonTypeContract = [
  Assert<IsExact<{ variant: 'habit-row'; label: 'Loading habits' }, SkeletonProps>>,
  Assert<IsExact<{ variant: 'settings'; label: 'Loading settings' }, SkeletonProps>>,
  Assert<IsExact<{ variant: 'stat-tile'; label: 'Loading stats' }, SkeletonProps>>,
  Assert<IsExact<{ variant: 'grid'; label: 'Loading calendar'; rows: 6; cols: 7; cell: 40; gap: 8 }, SkeletonProps>>,
  // @ts-expect-error every skeleton requires an accessible label
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
