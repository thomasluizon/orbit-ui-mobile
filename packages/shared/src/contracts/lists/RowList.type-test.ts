import type { RowListProps } from './RowList'

type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T

type Accepts<
  Actual extends Expected & Record<Exclude<keyof Actual, keyof Expected>, never>,
  Expected,
> = Actual

type Valid = Accepts<{
  children: 'rows'
  style: { display: 'grid' }
}, RowListProps>

// @ts-expect-error the container owns its only separation treatment
type Separator = Accepts<{ children: 'rows'; separator: true }, RowListProps>
// @ts-expect-error dividers are not caller-configurable
type Divider = Accepts<{ children: 'rows'; divider: true }, RowListProps>
// @ts-expect-error rules are not caller-configurable
type Rule = Accepts<{ children: 'rows'; rule: true }, RowListProps>

export type RowListTypeAssertionsWidthAssertions = [
  Assert<IsExactWidth<RowListProps['children'], import('react').ReactNode>>,
  Assert<IsExactWidth<RowListProps['style'], unknown>>,
]

export type RowListTypeAssertions =
  | Valid
  | Separator
  | Divider
  | Rule
