import { hojeMeals } from './names.mjs'

export async function seedHojeNextStep(api, account, today, dailyHabit) {
  const groups = [[account.habitId, 'Meals', hojeMeals],
    [account.secondHabitId, 'Water', Array.from({ length: 6 }, () => ({ title: 'Water - 710ml', dueTime: null }))]]
  for (const [parentId, , children] of groups) {
    for (const child of children) {
      await api('POST', `habits/${parentId}/sub-habits`, { ...dailyHabit(child.title, today), dueTime: child.dueTime })
    }
  }
  const { payload: meals } = await api('GET', `habits/${account.habitId}`)
  const breakfast = meals?.children?.find((child) => child.title === 'Breakfast')
  if (typeof breakfast?.id !== 'string') throw new Error('Hoje fixture lacks Breakfast readback.')
  await api('POST', `habits/${breakfast.id}/log`, { date: today })
  for (const [parentId, title, expected] of groups) {
    const { payload: parent } = await api('GET', `habits/${parentId}`)
    if (parent?.title !== title || !Array.isArray(parent.children) || parent.children.length !== expected.length) {
      throw new Error('Hoje fixture parent or child count readback failed.')
    }
    for (const [index, child] of parent.children.entries()) {
      if (child.title !== expected[index].title || child.dueTime !== expected[index].dueTime
        || child.parentHabitId !== parentId || child.position !== index
        || (child.title !== 'Breakfast' && child.dueDate !== today)) {
        throw new Error('Hoje fixture ordered schedule readback failed.')
      }
    }
  }
  const { payload: exported } = await api('GET', 'profile/export')
  if (!Array.isArray(exported?.habits) || exported.habits.length !== 12
    || exported.habits.some((habit) => !Array.isArray(habit.logs)
      || (habit.id === breakfast.id
        ? habit.logs.length !== 1 || habit.logs[0].date !== today || habit.logs[0].value !== 1
        : habit.logs.some((log) => log.value > 0)))) {
    throw new Error('Hoje fixture completion history readback failed.')
  }
  return exported
}
