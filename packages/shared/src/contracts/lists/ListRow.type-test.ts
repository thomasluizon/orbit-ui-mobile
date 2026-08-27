import type { ListRowAction, ListRowProps } from './ListRow'

const acceptsListRow = (_props: ListRowProps) => undefined
const acceptsListRowAction = (_action: ListRowAction) => undefined

acceptsListRow({ title: 'Reminder', value: '08:00' })
acceptsListRow({ title: 'Start date', readOnly: true })
acceptsListRow({
  title: 'Template',
  action: { icon: 'trash', label: 'Delete template', onPress: () => undefined },
})

// @ts-expect-error a read-only row renders no control
acceptsListRow({
  title: 'Start date',
  readOnly: true,
  action: { icon: 'trash', label: 'Delete', onPress: () => undefined },
})
// @ts-expect-error an icon action requires an accessible label
acceptsListRowAction({ icon: 'trash', onPress: () => undefined })
// @ts-expect-error values are words, nodes belong in trailing
acceptsListRow({ title: 'Reminder', value: { type: 'badge' } })
