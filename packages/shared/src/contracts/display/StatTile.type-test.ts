import type { StatTileProps } from './StatTile'

const acceptStatTile = (_props: StatTileProps): void => undefined

acceptStatTile({ label: 'Total', value: 4 })
acceptStatTile({ label: 'Total', state: 'loading', loadingLabel: 'Loading' })
acceptStatTile({ label: 'Total', state: 'empty', emptyLabel: 'No data' })

// @ts-expect-error default state requires value
acceptStatTile({ label: 'Total' })
// @ts-expect-error default state rejects emptyLabel
acceptStatTile({ label: 'Total', value: 4, emptyLabel: 'No data' })
// @ts-expect-error default state rejects loadingLabel
acceptStatTile({ label: 'Total', value: 4, loadingLabel: 'Loading' })
// @ts-expect-error loading state requires loadingLabel
acceptStatTile({ label: 'Total', state: 'loading' })
// @ts-expect-error loading state rejects value
acceptStatTile({ label: 'Total', state: 'loading', loadingLabel: 'Loading', value: 0 })
// @ts-expect-error empty state requires emptyLabel
acceptStatTile({ label: 'Total', state: 'empty' })
// @ts-expect-error empty state rejects value, including zero
acceptStatTile({ label: 'Total', state: 'empty', emptyLabel: 'No data', value: 0 })
// @ts-expect-error stat tiles are not clickable
acceptStatTile({ label: 'Total', value: 4, onClick: () => undefined })
// @ts-expect-error stat tiles cannot be disabled
acceptStatTile({ label: 'Total', value: 4, disabled: true })
