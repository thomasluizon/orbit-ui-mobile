import { isDeepStrictEqual } from 'node:util'

const result = (pass, reason) => ({ pass, score: pass ? 1 : 0, reason })
const sameIds = (actual, expected) => Array.isArray(actual) && actual.length === expected.length
  && new Set(actual).size === actual.length && actual.every((id) => expected.includes(id))
const isoDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value

function completeReads(calls, ids) {
  const seen = []
  for (const call of calls) {
    const args = call.arguments
    const page = call.result?.payload
    if (call.name !== 'query_habits' || call.resultStatus !== 'Succeeded' || call.result?.success !== true
      || args.date !== 'today' || args.is_completed !== false || args.include_overdue !== true
      || ['search', 'tag', 'frequency', 'is_general', 'is_bad_habit', 'relative_period'].some((key) => args[key] != null)
      || (args.offset ?? 0) !== seen.length || page?.totalCount !== ids.length || !Array.isArray(page.items)
      || !page.items.length || page.items.some((item) => !['today', 'overdue'].includes(item.status))) return false
    seen.push(...page.items.map((item) => item.id))
  }
  return sameIds(seen, ids)
}

export function restartProposal(output, vars) {
  const ids = vars.restartBaseline?.map(({ habit }) => habit.id)
  const calls = output.trace?.calls
  if (!ids?.length || !Array.isArray(calls) || calls.length < 2) return result(false, 'Restart lacks fixture or tool evidence.')
  const write = calls.at(-1)
  if (!completeReads(calls.slice(0, -1), ids)) return result(false, 'Restart must read every unfinished page before its write.')
  const args = write.arguments
  if (write.name !== 'bulk_reschedule_habits' || write.resultStatus !== 'PendingConfirmation'
    || write.result?.success !== true || args.orbit_write_complete !== true
    || args.filter != null || args.due_date != null || !sameIds(args.revised_items?.map((item) => item.habit_id), ids)) {
    return result(false, 'Restart requires one held per-habit bulk reschedule without a shared filter or date.')
  }
  const dates = new Map()
  for (const item of args.revised_items) {
    const date = item.updates?.due_date
    const offset = (Date.parse(date) - Date.parse(vars.accountDate)) / 86400000
    if (!isoDate(date) || offset < 0 || offset > vars.restart.windowDays
      || Object.entries(item.updates).some(([key, value]) => key !== 'due_date' && value != null)) {
      return result(false, 'Restart may change only dates within its bounded window.')
    }
    dates.set(item.habit_id, date)
  }
  const todayCount = [...dates.values()].filter((date) => date === vars.accountDate).length
  if (todayCount < 1 || todayCount >= ids.length / 2
    || (vars.restart.todayCount != null && todayCount !== vars.restart.todayCount)) {
    return result(false, 'Restart today set must be smaller and respect the requested count.')
  }
  const response = output.composition
  const pending = response?.pendingOperations
  if (pending?.length !== 1 || pending[0].actionKey !== 'rescheduleHabits'
    || !sameIds(pending[0].items?.map((item) => item.entityId), ids)
    || response.parts?.length || response.aiMessage?.trim() || response.actions?.length || response.policyDenials?.length) {
    return result(false, 'Restart must return only one complete reschedule preview.')
  }
  for (const item of pending[0].items) {
    const field = item.fields?.[0]
    if (item.fields?.length !== 1 || field.field !== 'due_date' || field.valueType !== 'date'
      || field.isEditable !== true || field.newValue !== dates.get(item.entityId)
      || field.proposedValue !== dates.get(item.entityId)) return result(false, 'Restart preview dates differ from the stored proposal.')
  }
  return result(true, 'Verified complete restart reads, per-habit dates and preview.')
}

function equalSnapshot(actual, baseline, dates = new Map()) {
  if (!sameIds(actual?.map(({ habit }) => habit.id), baseline.map(({ habit }) => habit.id))) return false
  return baseline.every((entry) => {
    const next = actual.find(({ habit }) => habit.id === entry.habit.id)
    const expected = { ...entry.habit, dueDate: dates.get(entry.habit.id) ?? entry.habit.dueDate }
    return isDeepStrictEqual(next.habit, expected) && isDeepStrictEqual(next.logs, entry.logs)
  })
}

export function restartReadback(output, vars) {
  const baseline = vars.restartBaseline
  const evidence = output.restartReadback
  if (!baseline?.length || !evidence || !equalSnapshot(evidence.held, baseline)) {
    return result(false, 'Independent readback must prove the held preview changed nothing.')
  }
  const dates = vars.restart.decision === 'approve'
    ? new Map(output.composition.pendingOperations[0].items.map((item) => [item.entityId, item.fields[0].newValue])) : new Map()
  return equalSnapshot(evidence.after, baseline, dates)
    ? result(true, 'Independent persisted readback matched dates and preserved habit fields and logs.')
    : result(false, 'Persisted restart readback differs from the approved dates or preserved fields and logs.')
}
