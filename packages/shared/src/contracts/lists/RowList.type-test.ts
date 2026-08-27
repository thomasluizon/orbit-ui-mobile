import type { RowListProps } from './RowList'

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

export type RowListTypeAssertions = Valid | Separator | Divider | Rule
