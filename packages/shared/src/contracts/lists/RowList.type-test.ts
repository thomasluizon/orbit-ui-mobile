import type { RowListProps } from './RowList'

const acceptsRowList = (_props: RowListProps) => undefined

acceptsRowList({ children: 'rows', style: { display: 'grid' } })

// @ts-expect-error the container owns its only separation treatment
acceptsRowList({ children: 'rows', separator: true })
// @ts-expect-error dividers are not caller-configurable
acceptsRowList({ children: 'rows', divider: true })
// @ts-expect-error rules are not caller-configurable
acceptsRowList({ children: 'rows', rule: true })
