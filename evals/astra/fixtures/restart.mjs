import { isDeepStrictEqual } from 'node:util'

const preserved = ['id', 'title', 'description', 'frequencyUnit', 'frequencyQuantity', 'days', 'intervalWeeks',
  'dueDate', 'dueTime', 'dueEndTime', 'reminderEnabled', 'reminderTimes', 'scheduledReminders',
  'relativeReminders', 'slipAlertEnabled', 'checklistItems', 'isBadHabit', 'isGeneral', 'isFlexible', 'endDate', 'emoji']

export async function readRestartSnapshot(api) {
  const { payload } = await api('GET', 'eval/snapshot')
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

function duePopulationFailure(due, ids) {
  const items = Array.isArray(due?.items) ? due.items : []
  const returned = items.map((habit) => habit.id)
  const counts = {
    total: Number.isInteger(due?.totalCount) ? due.totalCount : 'missing',
    items: Array.isArray(due?.items) ? items.length : 'missing',
    missing: ids.filter((id) => !returned.includes(id)).length,
    unexpected: returned.filter((id) => !ids.includes(id)).length,
    duplicate: returned.length - new Set(returned).size,
    completed: items.filter((habit) => habit.isCompleted !== false).length,
    logged: items.filter((habit) => habit.isLoggedInRange !== false).length,
    skipped: items.filter((habit) => habit.isSkippedOnDate !== false).length,
  }
  const failed = counts.total !== ids.length || counts.items !== ids.length
    || ['missing', 'unexpected', 'duplicate', 'completed', 'logged', 'skipped'].some((key) => counts[key] > 0)
  return failed ? Object.entries(counts).map(([key, value]) => `${key} ${value}`).join(', ') : null
}

export async function seedRestart(api, account, today, titles, dailyHabit, dateOffset, nonDaily = false) {
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
      frequencyQuantity: nonDaily && index < 4 ? 3 : 1,
      dueTime: index % 2 ? '18:00:00' : '08:00:00', dueEndTime: index % 2 ? '18:15:00' : '08:15:00',
      reminderEnabled: true, reminderTimes: [30],
      checklistItems: [{ text: titles[index], isChecked: false }], clearEndDate: true, clearParent: true })
  }
  const { payload: due } = await api('GET', `habits?dateFrom=${today}&dateTo=${today}&includeOverdue=true&isCompleted=false&page=1&pageSize=50`)
  const population = duePopulationFailure(due, ids)
  if (population) throw new Error(`Restart fixture needs all six unfinished habits due today or overdue (${population}).`)
  const baseline = await readRestartSnapshot(api)
  for (const [index, id] of ids.entries()) {
    const entry = baseline.find(({ habit }) => habit.id === id)
    if (entry.habit.title !== titles[index] || entry.habit.dueDate !== (index < 4 ? dateOffset(today, -2) : today)
      || entry.habit.frequencyUnit !== 'Day' || entry.habit.frequencyQuantity !== (nonDaily && index < 4 ? 3 : 1) || entry.habit.days.length !== 0
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
