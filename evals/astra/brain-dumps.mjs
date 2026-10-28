import { isDeepStrictEqual } from 'node:util'
import { validDraft } from './suggestions.mjs'

const result = (pass, reason) => ({ pass, score: pass ? 1 : 0, reason })
const normalize = (value) => typeof value === 'string'
  ? value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim() : ''
export const sameTime = (left, right) => typeof left === 'string' && typeof right === 'string'
  && /^\d{2}:\d{2}(?::00)?$/.test(left) && /^\d{2}:\d{2}(?::00)?$/.test(right)
  && left.slice(0, 5) === right.slice(0, 5)
const field = (item, name) => item.fields.find((change) => change.field === name)?.proposedValue

function requestedItem(habit, expected) {
  return normalize(habit.title).includes(normalize(expected.titleContains))
    && Object.entries(expected).filter(([key]) => !['titleContains', 'habitType'].includes(key))
      .every(([key, value]) => key === 'due_time' ? sameTime(habit[key], value) : habit[key] === value)
}

function chosenIdea(output, habits, vars) {
  const drafts = output.trace?.calls?.filter((call) => call.name === 'suggest_habits')
    .flatMap((call) => call.result?.payload?.drafts ?? []) ?? []
  return drafts.length === vars.brainDump.additionalIdeas && drafts.every((draft) => validDraft(draft, vars.accountDate)
    && draft.type === 'Habit' && draft.frequencyUnit === 'Day' && draft.frequencyQuantity === 1
    && habits.some((habit) => habit.title === draft.title && (habit.habit_id ?? null) === (draft.existingHabitId ?? null)
      && habit.frequency_unit === draft.frequencyUnit && habit.frequency_quantity === draft.frequencyQuantity
      && habit.due_date === draft.dueDate && sameTime(habit.due_time, draft.dueTime)
      && sameTime(habit.due_end_time, draft.dueEndTime)
      && isDeepStrictEqual(habit.days ?? [], draft.days)
      && habit.emoji === draft.emoji && habit.reminder_enabled === (draft.reminderMinutesBefore !== null)
      && isDeepStrictEqual(habit.reminder_times ?? [], draft.reminderMinutesBefore === null ? [] : [draft.reminderMinutesBefore])
      && isDeepStrictEqual(habit.checklist_items ?? [], draft.checklistItems.map((text) => ({ text, is_checked: false })))))
}

export function brainDumpPreview(output, vars) {
  const response = output.composition
  const pending = response?.pendingOperations
  const calls = output.trace?.calls?.filter((call) => call.name === 'bulk_create_habits') ?? []
  const habits = calls[0]?.arguments?.habits
  const expected = vars.brainDump
  if (!expected || output.httpStatus !== 200 || pending?.length !== 1 || calls.length !== 1
    || calls[0].resultStatus !== 'PendingConfirmation'
    || !Array.isArray(habits) || habits.length !== expected.items.length + (expected.additionalIdeas ?? 0)
    || pending[0].items?.length !== habits.length) return result(false, 'Brain dump requires one complete held bulk preview.')
  const parts = response.parts
  const prose = response.aiMessage ?? ''
  if (!Array.isArray(parts) || parts.length > 1 || parts.some((part) => part.type !== 'text' || part.text !== prose)
    || (parts.length === 0 && prose) || prose.length > 180 || /[\d\n]/u.test(prose)
    || (prose.match(/[.!?](?:\s|$)/gu)?.length ?? 0) > 1 || /^\s*(?:#|[-*•])/u.test(prose)
    || ['actions', 'policyDenials', 'followUps', 'followUpContext'].some((key) => response[key]?.length)
    || (response.operations ?? []).some((operation) => !['Succeeded', 'PendingConfirmation'].includes(operation.status))) {
    return result(false, 'Brain dump allows only one short sentence without figures and one preview.')
  }
  if (new Set(habits.map((habit) => normalize(habit.title))).size !== habits.length
    || new Set(pending[0].items.map((item) => item.itemId)).size !== habits.length) return result(false, 'Brain dump contains duplicate items.')
  for (const expectedItem of expected.items) {
    const matches = habits.filter((habit) => requestedItem(habit, expectedItem))
    if (matches.length !== 1) return result(false, 'Brain dump lost a requested item, identity or schedule.')
    const item = pending[0].items.find((item) => item.entityName === matches[0].title)
    if (item?.habitType !== expectedItem.habitType) return result(false, 'Brain dump lost its task or habit type.')
  }
  for (const habit of habits) {
    const item = pending[0].items.find((item) => item.entityName === habit.title)
    const type = habit.frequency_unit === 'OneTime' ? 'Task' : 'Habit'
    if (!item || item.habitType !== type || (item.entityId ?? null) !== (habit.habit_id ?? null)
      || (habit.habit_id && !expected.items.some((requested) => requested.habit_id === habit.habit_id))
      || habit.parent_habit_id || habit.sub_habits?.length || calls[0].arguments.parent_habit_id
      || (habit.frequency_unit != null && !['OneTime', 'Day'].includes(habit.frequency_unit))) {
      return result(false, 'Brain dump preview does not preserve item types and identities.')
    }
    for (const name of ['frequency_unit', 'frequency_quantity', 'due_date', 'due_time', 'due_end_time']) {
      if (habit[name] != null && !(name.includes('time') ? sameTime(field(item, name), habit[name])
        : field(item, name) === habit[name])) return result(false, 'Brain dump preview omitted a proposed schedule field.')
    }
  }
  if (expected.additionalIdeas && !chosenIdea(output, habits, vars)) return result(false, 'Suggested drafts did not join the same preview unchanged.')
  return result(true, 'Verified one brain dump preview, requested schedules and existing identities.')
}
