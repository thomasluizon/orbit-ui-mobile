import type { StatTileProps } from './StatTile'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T

type DefaultVariant = Extract<StatTileProps, { state?: 'default' }>
type LoadingVariant = Extract<StatTileProps, { state: 'loading' }>
type EmptyVariant = Extract<StatTileProps, { state: 'empty' }>
type ExpectedDefaultVariant = {
  label: string
  state?: 'default'
  value: string | number
  emptyLabel?: never
  loadingLabel?: never
}
type ExpectedLoadingVariant = {
  label: string
  state: 'loading'
  loadingLabel: string
  value?: never
  emptyLabel?: never
}
type ExpectedEmptyVariant = {
  label: string
  state: 'empty'
  emptyLabel: string
  value?: never
  loadingLabel?: never
}

export type StatTileTypeContract = [
  Assert<IsExactWidth<DefaultVariant, ExpectedDefaultVariant>>,
  Assert<IsExactWidth<LoadingVariant, ExpectedLoadingVariant>>,
  Assert<IsExactWidth<EmptyVariant, ExpectedEmptyVariant>>,
  Assert<IsExactWidth<StatTileProps['label'], string>>,
  Assert<IsExactWidth<StatTileProps['state'], 'default' | 'loading' | 'empty' | undefined>>,
  Assert<IsExactWidth<StatTileProps['value'], string | number | undefined>>,
  Assert<IsExactWidth<StatTileProps['emptyLabel'], string | undefined>>,
  Assert<IsExactWidth<StatTileProps['loadingLabel'], string | undefined>>,
  Assert<IsExact<{ label: 'Total'; value: 4 }, StatTileProps>>,
  Assert<IsExact<{ label: 'Total'; state: 'loading'; loadingLabel: 'Loading' }, StatTileProps>>,
  Assert<IsExact<{ label: 'Total'; state: 'empty'; emptyLabel: 'No data' }, StatTileProps>>,
  // @ts-expect-error default state requires value
  Assert<IsExact<{ label: 'Total' }, StatTileProps>>,
  // @ts-expect-error default state rejects emptyLabel
  Assert<IsExact<{ label: 'Total'; value: 4; emptyLabel: 'No data' }, StatTileProps>>,
  // @ts-expect-error default state rejects loadingLabel
  Assert<IsExact<{ label: 'Total'; value: 4; loadingLabel: 'Loading' }, StatTileProps>>,
  // @ts-expect-error loading state requires loadingLabel
  Assert<IsExact<{ label: 'Total'; state: 'loading' }, StatTileProps>>,
  // @ts-expect-error loading state rejects value
  Assert<IsExact<{ label: 'Total'; state: 'loading'; loadingLabel: 'Loading'; value: 0 }, StatTileProps>>,
  // @ts-expect-error empty state requires emptyLabel
  Assert<IsExact<{ label: 'Total'; state: 'empty' }, StatTileProps>>,
  // @ts-expect-error empty state rejects value, including zero
  Assert<IsExact<{ label: 'Total'; state: 'empty'; emptyLabel: 'No data'; value: 0 }, StatTileProps>>,
  // @ts-expect-error stat tiles are not clickable
  Assert<IsExact<{ label: 'Total'; value: 4; onClick: () => undefined }, StatTileProps>>,
  // @ts-expect-error stat tiles cannot be disabled
  Assert<IsExact<{ label: 'Total'; value: 4; disabled: true }, StatTileProps>>,
]
