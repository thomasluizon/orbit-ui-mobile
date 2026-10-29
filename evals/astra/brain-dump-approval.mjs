import { isDeepStrictEqual } from 'node:util'
import { publicApi } from './fixtures/api.mjs'
import { clearPendingOperations, requireStagingOrigin } from './fixtures/reset.mjs'
import { safeFailureMessage } from './credentials.mjs'
import { outcomeCalls } from './operation-matcher.mjs'
import { sameTime } from './brain-dumps.mjs'

const result = (pass, reason, evidence = {}) => ({ pass, score: pass ? 1 : 0, reason, ...evidence })
const ordered = (habits) => [...habits].sort((left, right) => left.id.localeCompare(right.id))

async function brainDumpSnapshot(vars) {
  requireStagingOrigin()
  const { payload } = await publicApi(vars.credentialKey)('GET', 'profile/export')
  if (!Array.isArray(payload?.habits)) throw new Error('Brain dump export lacks persisted habits.')
  return ordered(payload.habits)
}

export async function brainDumpBaseline(vars) {
  const habits = await brainDumpSnapshot(vars)
  const api = publicApi(vars.credentialKey)
  const details = []
  for (const habit of habits) details.push([habit.id, (await api('GET', `habits/${habit.id}`)).payload])
  return { habits, details }
}

async function verifySavedItem(api, habit, saved, baseline) {
  const matches = saved.filter((row) => habit.habit_id ? row.id === habit.habit_id : row.title === habit.title)
  if (matches.length !== 1) throw new Error('Brain dump saved item is missing or duplicated.')
  const row = matches[0]
  const original = baseline.find((item) => item.id === habit.habit_id)
  const unit = habit.frequency_unit ?? original?.frequencyUnit
  const expected = {
    frequencyUnit: unit === 'OneTime' ? null : unit,
    frequencyQuantity: unit === 'OneTime' ? null : habit.frequency_quantity ?? original?.frequencyQuantity,
    dueDate: habit.due_date ?? original?.dueDate,
    days: habit.days ?? original?.days ?? [],
  }
  if (row.title !== habit.title || !Object.entries(expected).every(([key, value]) => isDeepStrictEqual(row[key], value))
    || saved.filter((candidate) => candidate.title === row.title).length !== 1) {
    throw new Error('Brain dump persisted identity or schedule differs from the proposal.')
  }
  const { payload: detail } = await api('GET', `habits/${row.id}`)
  const schedule = unit === 'OneTime' ? 'OneTime' : 'Recurring'
  if (detail?.schedule !== schedule
    || (habit.due_time != null && !sameTime(detail.dueTime, habit.due_time))
    || (habit.due_end_time != null && !sameTime(detail.dueEndTime, habit.due_end_time))
    || (habit.start_date != null && detail.startDate !== habit.start_date)
    || (habit.end_date != null && row.endDate !== habit.end_date)
    || (habit.interval_weeks != null && row.intervalWeeks !== habit.interval_weeks)) {
    throw new Error('Brain dump detail readback lost its schedule or time.')
  }
  return { title: row.title, reused: Boolean(habit.habit_id), schedule, ...expected,
    dueTime: detail.dueTime, dueEndTime: detail.dueEndTime }
}

async function approveAndRead(output, vars, baseline, api) {
  const before = await brainDumpBaseline(vars)
  if (!isDeepStrictEqual(before, baseline)) throw new Error('Brain dump persisted a change before approval.')
  const { payload: held } = await api('GET', 'eval/pending-operations')
  if (held?.pendingCount !== 1) throw new Error('Brain dump did not hold exactly one pending operation.')
  const pending = output.composition.pendingOperations[0]
  const path = `ai/pending-operations/${encodeURIComponent(pending.id)}`
  const { payload: confirmation } = await api('POST', `${path}/confirm?clientContext=${encodeURIComponent(JSON.stringify(vars.clientContext))}`)
  if (typeof confirmation?.confirmationToken !== 'string' || !confirmation.confirmationToken.trim()) {
    throw new Error('Brain dump confirmation did not return an approval token.')
  }
  await api('POST', `${path}/execute`, { confirmationToken: confirmation.confirmationToken, clientContext: vars.clientContext })
  const saved = await brainDumpSnapshot(vars)
  const habits = outcomeCalls(output.trace.calls, vars.expectations)
    .find((call) => call.name === 'bulk_create_habits').arguments.habits
  if (saved.length !== baseline.habits.length + habits.filter((habit) => !habit.habit_id).length
    || !baseline.habits.every((original) => isDeepStrictEqual(saved.find((row) => row.id === original.id), original))) {
    throw new Error('Brain dump approval duplicated a habit or changed an existing fixture.')
  }
  for (const [id, original] of baseline.details) {
    if (!isDeepStrictEqual((await api('GET', `habits/${id}`)).payload, original)) {
      throw new Error('Brain dump approval changed an existing fixture detail.')
    }
  }
  const persistedItems = []
  for (const habit of habits) persistedItems.push(await verifySavedItem(api, habit, saved, baseline.habits))
  const { payload: completed } = await api('GET', 'eval/pending-operations')
  if (completed?.pendingCount !== 0) throw new Error('Brain dump approval left a pending operation.')
  return result(true, 'Verified no changes before approval and every persisted schedule after approval.',
    { beforeApprovalUnchanged: true, persistedItems })
}

export async function approveBrainDump(output, vars, baseline, previewVerdict) {
  requireStagingOrigin()
  const api = publicApi(vars.credentialKey)
  let evidence = previewVerdict
  try {
    if (previewVerdict.pass) evidence = await approveAndRead(output, vars, baseline, api)
  } catch (error) { evidence = result(false, safeFailureMessage(error)) }
  try { await clearPendingOperations(api) } catch (error) { evidence = result(false, safeFailureMessage(error)) }
  return evidence
}
