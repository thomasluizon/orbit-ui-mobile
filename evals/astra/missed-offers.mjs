const dayNumber = (date) => Date.parse(`${date}T00:00:00Z`) / 86400000
const isoDate = (day) => new Date(day * 86400000).toISOString().slice(0, 10)
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function sourceRow({ kind, block }, habitId, today) {
  if (kind === 'habitList' && (block.date == null || block.date === today)) return block.items?.find((row) => row.id === habitId)
  if (kind === 'daySummary' && block.date === today && (block.dateTo == null || block.dateTo === today)) return block.rows?.find((row) => row.id === habitId)
  if (kind === 'metrics' && block.habitId === habitId
    || kind === 'periodInsight' && block.needsAttention?.some((row) => row.habitId === habitId)) return { status: 'none' }
}

// Mirror HabitScheduleService.WasScheduledOnDate against independent detail and export history.
function scheduled(habit, date, weekStartDay, anchorDate = habit.scheduledStartDate ?? habit.dueDate) {
  if (date < anchorDate || habit.endDate != null && date > habit.endDate) return false
  if (habit.frequencyUnit === null) return date === habit.dueDate
  const target = new Date(`${date}T00:00:00Z`)
  const anchor = new Date(`${anchorDate}T00:00:00Z`)
  if (habit.days.length && !habit.days.includes(weekdays[target.getUTCDay()])) return false
  const interval = habit.intervalWeeks ?? 1
  if (interval > 1) {
    if (!Number.isInteger(weekStartDay) || weekStartDay < 0 || weekStartDay > 6) return false
    const week = (day) => dayNumber(day) - (new Date(`${day}T00:00:00Z`).getUTCDay() - weekStartDay + 7) % 7
    if ((week(date) - week(anchorDate)) / 7 % interval !== 0) return false
  }
  const quantity = habit.frequencyQuantity ?? 1
  if (!Number.isInteger(quantity) || quantity < 1) return false
  const days = dayNumber(date) - dayNumber(anchorDate)
  if (habit.frequencyUnit === 'Day') return days % quantity === 0
  if (habit.frequencyUnit === 'Week') return days % (quantity * 7) === 0
  const months = (target.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + target.getUTCMonth() - anchor.getUTCMonth()
  const monthDays = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  if (habit.frequencyUnit === 'Month') return months % quantity === 0 && target.getUTCDate() === Math.min(anchor.getUTCDate(), monthDays)
  if (habit.frequencyUnit === 'Year') return (target.getUTCFullYear() - anchor.getUTCFullYear()) % quantity === 0
    && target.getUTCMonth() === anchor.getUTCMonth() && target.getUTCDate() === Math.min(anchor.getUTCDate(), monthDays)
  return false
}

export function groundedMissedAction(entry, habit, vars) {
  const row = sourceRow(entry, habit.id, vars.accountDate)
  if (!row || row.isBadHabit || row.isSkippedOnDate === true || habit.isGeneral !== false || habit.isFlexible !== false
    || !Object.hasOwn(habit, 'frequencyUnit') || !Object.hasOwn(habit, 'endDate')
    || !Array.isArray(habit.days) || !Array.isArray(habit.logs) || typeof habit.dueDate !== 'string') return false
  const resolved = new Set(habit.logs.filter((log) => log.value >= 0).map((log) => log.date))
  const unresolved = (date, anchor) => scheduled(habit, date, vars.offerWeekStartDay, anchor) && !resolved.has(date)
  const today = vars.accountDate
  const oneTime = habit.frequencyUnit === null
  const recent = oneTime ? [] : Array.from({ length: 14 }, (_, index) => isoDate(dayNumber(today) - index - 1)).filter((date) => unresolved(date))
  const latest = habit.endDate != null && habit.endDate < today ? habit.endDate : isoDate(dayNumber(today) - 1)
  const earlier = !oneTime && row.status === 'overdue' && habit.dueDate < today
    && (unresolved(habit.dueDate) || Array.from({ length: 366 }, (_, index) => isoDate(dayNumber(latest) - index))
      .some((date) => date >= habit.dueDate && unresolved(date, habit.dueDate)))
  const eligible = oneTime ? habit.dueDate < today && unresolved(habit.dueDate) : recent.length > 0 || earlier
  if (!eligible) return false
  return entry.action.offerKey.startsWith('restart:') ? entry.action.date === today
    : oneTime ? entry.action.date === habit.dueDate
      : recent.length ? entry.action.date === recent[0] : entry.action.date == null
}
