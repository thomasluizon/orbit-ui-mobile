import { isDeepStrictEqual } from 'node:util'
import { publicApi } from './fixtures/api.mjs'
import { requireEvalOrigin } from './fixtures/reset.mjs'
import { refreshCredential } from './credentials.mjs'

const result = (pass, reason, metadata = {}) => ({ pass, score: pass ? 1 : 0, reason, metadata })
const ordered = (habits) => [...habits].sort((left, right) => left.id.localeCompare(right.id))

export async function readStartingHabits(credentialKey) {
  requireEvalOrigin()
  const { payload } = await publicApi(credentialKey)('GET', 'profile/export')
  if (!Array.isArray(payload?.habits) || payload.habits.some((habit) => typeof habit.id !== 'string'
    || typeof habit.title !== 'string' || !Array.isArray(habit.checklistItems))) throw new Error('Saved-step export lacks habit evidence.')
  return ordered(payload.habits)
}

function savedHabit(after, baseline, vars) {
  const step = vars.previousStartingStep.step
  if (vars.startingStepAction === 'saveTask') {
    const additions = after.filter((habit) => !baseline.some((existing) => existing.id === habit.id))
    if (additions.length !== 1 || !isDeepStrictEqual(ordered(after.filter((habit) => habit.id !== additions[0].id)), ordered(baseline))) return null
    const habit = additions[0]
    return habit.title === step && habit.frequencyUnit === null && habit.frequencyQuantity === null
      && Array.isArray(habit.days) && habit.days.length === 0 && habit.isBadHabit === false && habit.isGeneral === false ? habit : null
  }
  const original = baseline.find((habit) => habit.id === vars.checklistHabitId)
  if (!original?.checklistItems.length) return null
  const expected = baseline.map((habit) => habit.id === original.id ? { ...habit,
    checklistItems: [...habit.checklistItems, { text: step, isChecked: false }] } : habit)
  return isDeepStrictEqual(ordered(after), ordered(expected)) ? after.find((habit) => habit.id === original.id) : null
}

function matchingPreview(pending, vars) {
  if (pending?.items?.length !== 1) return false
  const item = pending.items[0]
  const step = vars.previousStartingStep?.step
  if (vars.startingStepAction === 'saveTask') return item.entityName === step
    && item.fields.some((field) => field.field === 'frequency_unit' && field.proposedValue === 'OneTime')
  const original = vars.startingHabitBaseline?.find((habit) => habit.id === vars.checklistHabitId)
  const proposed = item.fields.find((field) => field.field === 'checklist_items')?.proposedValue
  return item.entityId === vars.checklistHabitId && original?.checklistItems.length > 0 && Array.isArray(proposed)
    && isDeepStrictEqual(proposed.map(({ text, is_checked }) => ({ text, isChecked: is_checked ?? false })),
      [...original.checklistItems, { text: step, isChecked: false }])
}

export async function approveStartingStep(parsed, vars) {
  requireEvalOrigin()
  const baseline = vars.startingHabitBaseline
  if (!Array.isArray(baseline) || !vars.previousStartingStep) return result(false, 'Missing saved-step baseline.')
  const pending = parsed.composition.pendingOperations[0]
  if (!matchingPreview(pending, vars)) return result(false, 'The held preview does not match the requested saved step.')
  await refreshCredential(vars.credentialKey)
  const before = await readStartingHabits(vars.credentialKey)
  if (!isDeepStrictEqual(before, ordered(baseline))) return result(false, 'Habits changed before approval.')
  const api = publicApi(vars.credentialKey)
  const path = `ai/pending-operations/${pending.id}`
  const clientContext = vars.clientContext
  const confirmation = await api('POST', `${path}/confirm?clientContext=${encodeURIComponent(JSON.stringify(clientContext))}`)
  if (confirmation.payload?.pendingOperationId !== pending.id || typeof confirmation.payload.confirmationToken !== 'string'
    || !confirmation.payload.confirmationToken) return result(false, 'Approval did not return a matching confirmation.')
  await api('POST', `${path}/execute`, { confirmationToken: confirmation.payload.confirmationToken, clientContext })
  const habit = savedHabit(await readStartingHabits(vars.credentialKey), baseline, vars)
  if (!habit) return result(false, 'Independent saved-step readback did not match the requested change.')
  return result(true, 'Approval and independent saved-step readback matched.', { savedStep: {
    approved: true, unchangedBeforeApproval: true, action: vars.startingStepAction, title: habit.title,
    frequencyUnit: habit.frequencyUnit, frequencyQuantity: habit.frequencyQuantity, checklistItems: habit.checklistItems,
  } })
}
