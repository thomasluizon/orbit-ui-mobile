import { sameTitleSet } from './names.mjs'

export async function readSameTitleSet(api, parentId) {
  const { payload: parent } = await api('GET', `habits/${parentId}`)
  if (typeof parent?.title !== 'string' || !Array.isArray(parent.children)) throw new Error('Same-title fixture parent readback is incomplete.')
  const children = parent.children.map(({ id, title, position }) => ({ id, title, position }))
  if (children.some((child) => typeof child.id !== 'string' || typeof child.title !== 'string' || !Number.isInteger(child.position))) {
    throw new Error('Same-title fixture child readback is incomplete.')
  }
  return { parent: { id: parentId, title: parent.title }, children: children.toSorted((left, right) => left.position - right.position) }
}

export async function seedSameTitleSet(api, account, today, dailyHabit) {
  await api('DELETE', `habits/${account.secondHabitId}`, undefined, ['HABIT_NOT_FOUND'])
  for (let index = 0; index < sameTitleSet.count; index++) {
    await api('POST', `habits/${account.habitId}/sub-habits`, dailyHabit(sameTitleSet.child, today))
  }
  const baseline = await readSameTitleSet(api, account.habitId)
  if (baseline.parent.title !== sameTitleSet.parent || baseline.children.length !== sameTitleSet.count
    || baseline.children.some((child, index) => child.title !== sameTitleSet.child || child.position !== index)) {
    throw new Error('Same-title fixture parent or ordered child readback failed.')
  }
  const { payload: exported } = await api('GET', 'eval/snapshot')
  if (!Array.isArray(exported?.habits) || exported.habits.length !== sameTitleSet.count + 1
    || exported.habits.some((habit) => !Array.isArray(habit.logs) || habit.logs.some((log) => log.value > 0))) {
    throw new Error('Same-title fixture habit count or history readback failed.')
  }
  return { baseline, exported }
}
