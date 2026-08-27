import type { Column, ColumnsProps } from './Columns'

const acceptColumn = (_column: Column): void => undefined
const acceptColumns = (_props: ColumnsProps): void => undefined

acceptColumn({ id: 'one', label: 'One', value: 0 })
acceptColumns({ columns: [], emptyLabel: 'No data' })
acceptColumns({ columns: [], emptyLabel: 'No data', currentId: 'one', max: 10 })

// @ts-expect-error a column cannot carry a date
acceptColumn({ id: 'one', label: 'One', value: 0, date: '2026-08-25' })
// @ts-expect-error a column set cannot carry a start
acceptColumns({ columns: [], emptyLabel: 'No data', start: '2026-08-25' })
// @ts-expect-error a column set cannot carry an interval
acceptColumns({ columns: [], emptyLabel: 'No data', interval: 'day' })
// @ts-expect-error a column set cannot carry an order
acceptColumns({ columns: [], emptyLabel: 'No data', order: 'ascending' })
// @ts-expect-error emptyLabel is required
acceptColumns({ columns: [] })
// @ts-expect-error currentId names at most one column
acceptColumns({ columns: [], emptyLabel: 'No data', currentId: ['one'] })
// @ts-expect-error columns are not clickable
acceptColumns({ columns: [], emptyLabel: 'No data', onClick: () => undefined })
// @ts-expect-error columns do not accept onPress
acceptColumns({ columns: [], emptyLabel: 'No data', onPress: () => undefined })
// @ts-expect-error columns do not accept hover state
acceptColumns({ columns: [], emptyLabel: 'No data', hover: true })
// @ts-expect-error columns do not accept focus state
acceptColumns({ columns: [], emptyLabel: 'No data', focus: true })
// @ts-expect-error columns do not accept active state
acceptColumns({ columns: [], emptyLabel: 'No data', active: true })
