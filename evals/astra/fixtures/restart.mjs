import { isDeepStrictEqual } from 'node:util'

const preserved = ['id', 'title', 'description', 'frequencyUnit', 'frequencyQuantity', 'days', 'intervalWeeks',
  'dueDate', 'dueTime', 'dueEndTime', 'reminderEnabled', 'reminderTimes', 'scheduledReminders',
  'relativeReminders', 'slipAlertEnabled', 'checklistItems', 'isBadHabit', 'isGeneral', 'isFlexible', 'endDate', 'emoji']

export async function readRestartSnapshot(api) {
  const { payload } = await api('GET', 'profile/export')
  if (!Array.isArray(payload?.habits) || payload.habits.length !== 6) throw new Error('Restart readback needs all six fixture habits.')
  const snapshot = []
  for (const exported of payload.habits) {
    const { payload: habit } = await api('GET', `habits/${exported.id}`)
    if (!preserved.every((field) => Object.hasOwn(habit, field)) || !Array.isArray(exported.logs)) {
      throw new Error('Restart independent detail or history readback is incomplete.')
    }
    snapshot.push({ habit: Object.fromEntries(preserved.map((field) => [field, habit[field]])),
      logs: exported.logs.toSorted((left, right) => left.date.localeCompare(right.date)) })
  }
  return snapshot.toSorted((left, right) => left.habit.id.localeCompare(right.habit.id))
}

export async function seedRestart(api, account, today, titles, dailyHabit, dateOffset) {
  const ids = [account.habitId, account.secondHabitId]
  for (const title of titles.slice(2)) {
    const { payload } = await api('POST', 'habits', dailyHabit(title, dateOffset(today, -6)))
    if (typeof payload?.id !== 'string') throw new Error('Restart fixture creation lacks its habit ID.')
    ids.push(payload.id)
  }
  for (const [index, id] of ids.entries()) {
    await api('PUT', `habits/${id}`, dailyHabit(titles[index], dateOffset(today, -6)))
    await api('POST', `habits/${id}/log`, { date: dateOffset(today, -6) })
    await api('PUT', `habits/${id}`, { ...dailyHabit(titles[index], index < 4 ? dateOffset(today, -2) : today),
      dueTime: index % 2 ? '18:00:00' : '08:00:00', dueEndTime: index % 2 ? '18:15:00' : '08:15:00',
      reminderEnabled: true, reminderTimes: [30],
      checklistItems: [{ text: titles[index], isChecked: false }], clearEndDate: true, clearParent: true })
  }
  const baseline = await readRestartSnapshot(api)
  for (const [index, id] of ids.entries()) {
    const entry = baseline.find(({ habit }) => habit.id === id)
    if (entry.habit.title !== titles[index] || entry.habit.dueDate !== (index < 4 ? dateOffset(today, -2) : today)
      || entry.habit.frequencyUnit !== 'Day' || entry.habit.frequencyQuantity !== 1 || entry.habit.days.length !== 0
      || entry.habit.reminderEnabled !== true || !isDeepStrictEqual(entry.habit.reminderTimes, [30])
      || entry.habit.dueTime !== (index % 2 ? '18:00:00' : '08:00:00')
      || entry.habit.dueEndTime !== (index % 2 ? '18:15:00' : '08:15:00')
      || !isDeepStrictEqual(entry.habit.checklistItems, [{ text: titles[index], isChecked: false }])
      || entry.logs.length !== 1 || entry.logs[0].date !== dateOffset(today, -6) || entry.logs[0].value !== 1) {
      throw new Error('Restart fixture failed independent field or history verification.')
    }
  }
  return baseline
}
