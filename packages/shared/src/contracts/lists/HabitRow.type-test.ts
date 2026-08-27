import type { HabitRowProps } from './HabitRow'

const acceptsHabitRow = (_props: HabitRowProps) => undefined

acceptsHabitRow({ title: 'Walk', statusLabel: 'pending' })
acceptsHabitRow({
  title: 'Walk',
  statusLabel: 'pending',
  onLog: () => undefined,
  logLabel: 'Log Walk',
})
acceptsHabitRow({ title: 'Walk', trailing: '2/3' })
acceptsHabitRow({
  title: 'Walk',
  statusLabel: 'pending',
  onMenu: () => undefined,
  menuLabel: 'More options',
})

// @ts-expect-error a replacement trailing node cannot carry ring words
acceptsHabitRow({ title: 'Walk', trailing: '2/3', statusLabel: 'pending' })
// @ts-expect-error a replacement trailing node cannot carry a log action
acceptsHabitRow({ title: 'Walk', trailing: '2/3', onLog: () => undefined })
// @ts-expect-error a replacement trailing node cannot carry a log label
acceptsHabitRow({ title: 'Walk', trailing: '2/3', logLabel: 'Log Walk' })
// @ts-expect-error a log action requires its accessible label
acceptsHabitRow({ title: 'Walk', statusLabel: 'pending', onLog: () => undefined })
// @ts-expect-error a log action requires the current status name
acceptsHabitRow({ title: 'Walk', onLog: () => undefined, logLabel: 'Log Walk' })
// @ts-expect-error a plain ring cannot carry a log action
acceptsHabitRow({ title: 'Walk', statusLabel: 'pending', onLog: () => undefined })
// @ts-expect-error a plain ring cannot carry a log label
acceptsHabitRow({ title: 'Walk', statusLabel: 'pending', logLabel: 'Log Walk' })
// @ts-expect-error a plain ring requires its current status name
acceptsHabitRow({ title: 'Walk' })
// @ts-expect-error a menu action requires its accessible label
acceptsHabitRow({ title: 'Walk', statusLabel: 'pending', onMenu: () => undefined })
// @ts-expect-error a menu label cannot exist without a menu action
acceptsHabitRow({ title: 'Walk', statusLabel: 'pending', menuLabel: 'More options' })
// @ts-expect-error frozen belongs to a day, not a habit row
acceptsHabitRow({ title: 'Walk', status: 'frozen', statusLabel: 'frozen' })
// @ts-expect-error skip advances the schedule and leaves the row
acceptsHabitRow({ title: 'Walk', status: 'skip', statusLabel: 'skipped' })
// @ts-expect-error only two inline display depths are representable
acceptsHabitRow({ title: 'Walk', depth: 2, statusLabel: 'pending' })
