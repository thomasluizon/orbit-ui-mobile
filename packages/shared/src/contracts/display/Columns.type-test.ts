import type { Column, ColumnsProps } from './Columns'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T

export type ColumnsTypeContract = [
  Assert<IsExactWidth<Column['id'], string>>,
  Assert<IsExactWidth<Column['label'], string>>,
  Assert<IsExactWidth<Column['value'], number>>,
  Assert<IsExactWidth<ColumnsProps['columns'], Column[] | undefined>>,
  Assert<IsExactWidth<ColumnsProps['max'], number | undefined>>,
  Assert<IsExactWidth<ColumnsProps['height'], number | undefined>>,
  Assert<IsExactWidth<ColumnsProps['currentId'], string | undefined>>,
  Assert<IsExactWidth<ColumnsProps['showValues'], boolean | undefined>>,
  Assert<IsExactWidth<ColumnsProps['label'], string | undefined>>,
  Assert<IsExactWidth<ColumnsProps['emptyLabel'], string>>,
  Assert<IsExact<{ id: 'one'; label: 'One'; value: 0 }, Column>>,
  Assert<IsExact<{ columns: []; emptyLabel: 'No data' }, ColumnsProps>>,
  Assert<IsExact<{ columns: []; emptyLabel: 'No data'; currentId: 'one'; max: 10 }, ColumnsProps>>,
  // @ts-expect-error a column cannot carry a date
  Assert<IsExact<{ id: 'one'; label: 'One'; value: 0; date: '2026-08-25' }, Column>>,
  // @ts-expect-error a column set cannot carry a start
  Assert<IsExact<{ columns: []; emptyLabel: 'No data'; start: '2026-08-25' }, ColumnsProps>>,
  // @ts-expect-error a column set cannot carry an interval
  Assert<IsExact<{ columns: []; emptyLabel: 'No data'; interval: 'day' }, ColumnsProps>>,
  // @ts-expect-error a column set cannot carry an order
  Assert<IsExact<{ columns: []; emptyLabel: 'No data'; order: 'ascending' }, ColumnsProps>>,
  // @ts-expect-error emptyLabel is required
  Assert<IsExact<{ columns: [] }, ColumnsProps>>,
  // @ts-expect-error currentId names at most one column
  Assert<IsExact<{ columns: []; emptyLabel: 'No data'; currentId: ['one'] }, ColumnsProps>>,
  // @ts-expect-error columns are not clickable
  Assert<IsExact<{ columns: []; emptyLabel: 'No data'; onClick: () => undefined }, ColumnsProps>>,
  // @ts-expect-error columns do not accept onPress
  Assert<IsExact<{ columns: []; emptyLabel: 'No data'; onPress: () => undefined }, ColumnsProps>>,
  // @ts-expect-error columns do not accept hover state
  Assert<IsExact<{ columns: []; emptyLabel: 'No data'; hover: true }, ColumnsProps>>,
  // @ts-expect-error columns do not accept focus state
  Assert<IsExact<{ columns: []; emptyLabel: 'No data'; focus: true }, ColumnsProps>>,
  // @ts-expect-error columns do not accept active state
  Assert<IsExact<{ columns: []; emptyLabel: 'No data'; active: true }, ColumnsProps>>,
]
