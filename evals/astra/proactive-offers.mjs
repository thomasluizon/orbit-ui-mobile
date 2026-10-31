import { isDeepStrictEqual } from 'node:util'
import { toolWrites } from './trace-policy.mjs'

export const offerResult = (pass, reason) => ({ pass, score: pass ? 1 : 0, reason })
const text = (value) => typeof value === 'string' && value.trim().length > 0
const uuid = (value) => typeof value === 'string' && /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/iu.test(value)
const reminders = ['reminder_enabled', 'reminder_times', 'scheduled_reminders', 'relative_reminders', 'repeat_reminder']
export const offerActions = (response) => [
  ...(response.parts ?? []).filter((part) => part.type === 'block' && part.block?.read?.nextAction)
    .map((part) => ({ action: part.block.read.nextAction, read: part.block.read, block: part.block })),
  ...(response.pendingOperations ?? []).filter((pending) => pending.nextAction)
    .map((pending) => ({ action: pending.nextAction, pending })),
]

export function visibleOffer(action) {
  return action ? { label: action.label, prompt: action.prompt ?? undefined } : undefined
}

function validAction({ action, read, pending }, vars) {
  const family = typeof action.offerKey === 'string' ? action.offerKey.split(':')[0] : undefined
  if (!['log', 'skip', 'restart', 'reminder', 'reviewHabit', 'goalLink', 'goalTarget', 'smallStep', 'notion', 'notification', 'reuse', 'summary', 'calendar', 'aim', 'inspect'].includes(family)) return false
  if (!text(action.offerKey) || action.offerKey.length > 200 || !text(action.label)
    || !['openSurface', 'preparePreview', 'continueChat'].includes(action.kind)
    || (action.entityId != null && !uuid(action.entityId))
    || (action.date != null && !/^\d{4}-\d{2}-\d{2}$/u.test(action.date))) return false
  if (action.kind === 'openSurface' ? !text(action.surface) || action.prompt != null
    : !text(action.prompt) || action.surface != null) return false
  const kind = ['summary', 'calendar', 'inspect'].includes(family) ? 'openSurface'
    : ['reviewHabit', 'smallStep', 'notion', 'reuse', 'aim'].includes(family) ? 'continueChat' : 'preparePreview'
  const key = `${family}:${action.entityId ?? action.surface ?? 'account'}${action.date ? `:${action.date}` : ''}`
  if (action.kind !== kind || action.offerKey !== key) return false
  if (pending) return uuid(pending.id) && text(pending.previewFingerprint)
  return uuid(read?.queryId) && text(read.queryFamily) && read.scope !== null && typeof read.scope === 'object'
    && text(read.revision) && text(read.refreshToken) && read.completeness === 'complete' && read.recovery == null
    && (!['log', 'restart', 'smallStep'].includes(action.offerKey.split(':')[0]) || action.date != null)
    && (action.offerKey.split(':')[0] !== 'log' || action.date === vars.accountDate)
}

function validRemoval(field, fields) {
  const removal = field.removal
  if (!field.isEditable || !text(removal?.offerKey) || removal.field !== field.field
    || !Array.isArray(removal.fields) || !removal.fields.length || new Set(removal.fields).size !== removal.fields.length
    || !removal.fields.includes(field.field)) return false
  const prefix = field.field.slice(0, field.field.lastIndexOf('/') + 1)
  const leaf = field.field.slice(prefix.length)
  const expected = reminders.includes(leaf) ? fields.filter((candidate) => candidate.provenance === 'suggested'
    && candidate.field.startsWith(prefix) && reminders.includes(candidate.field.slice(prefix.length))) : [field]
  return isDeepStrictEqual([...removal.fields].sort(), expected.map((candidate) => candidate.field).sort())
    && removal.fields.every((path) => fields.some((candidate) => candidate.field === path && candidate.provenance === 'suggested'))
}

function containsSuggestions(value) {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, child]) => key === 'suggested_fields' && child !== null
    || containsSuggestions(child))
}

function previewFailure(response, enabled, calls) {
  for (const pending of response.pendingOperations ?? []) {
    const annotated = containsSuggestions(calls) || pending.items?.some((item) => item.fields?.some((field) => field.provenance != null || field.removal != null))
    for (const item of pending.items ?? []) {
      for (const field of item.fields ?? []) {
        if (!enabled && (field.provenance != null || field.removal != null)) return 'Unsupported client received suggestion metadata.'
        if (!enabled || !annotated) continue
        if (!['requested', 'stored', 'suggested'].includes(field.provenance)) return 'Missing or invalid field provenance.'
        if (field.provenance === 'suggested' ? !validRemoval(field, item.fields) : field.removal != null) {
          return 'Suggestion removal does not preserve requested and stored fields or its complete group.'
        }
      }
    }
  }
}

function groundedAction({ action, block }, vars) {
  const family = action.offerKey.split(':')[0]
  const habits = vars.fixtureEvidence?.habits ?? vars.offerBaseline?.habits ?? []
  const goals = vars.fixtureEvidence?.goals ?? vars.offerBaseline?.goals ?? []
  if (['log', 'skip', 'restart', 'reminder', 'reviewHabit'].includes(family)) {
    const habit = habits.find((habit) => habit.id === action.entityId)
    if (!habit || habit.isBadHabit || habit.isCompleted) return false
    if (family === 'log') {
      const row = (block?.items ?? block?.rows ?? []).find((row) => row.id === habit.id)
      if (!row || row.isBadHabit || row.status !== 'today' || row.isSkippedOnDate === true
        || habit.logs?.some((log) => log.date === action.date && log.value > 0)
        || (block.date != null && block.date !== action.date)) return false
    }
    if (family === 'reminder' && habit.reminderEnabled) return false
    if (family === 'skip' && (action.date != null && action.date >= vars.accountDate
      || habit.dueDate < vars.accountDate && action.date == null)) return false
  }
  if (family === 'smallStep') {
    const emptyDay = block?.date === vars.accountDate && block.due === block.done && block.overdueCount === 0
    const emptyList = block?.scope === 'today' && block.totalCount === 0 && block.items?.length === 0
      && !['search', 'tag', 'is_completed'].some((key) => Object.hasOwn(block.read.scope, key))
    if (!emptyDay && !emptyList) return false
  }
  if (['goalLink', 'goalTarget'].includes(family)) {
    const goal = goals.find((goal) => goal.id === action.entityId)
    if (!goal || goal.status !== 'Active') return false
    const row = block?.items?.find((row) => row.id === goal.id)
    if (!row) return false
    if (row.trackingStatus && !['behind', 'at_risk'].includes(row.trackingStatus)) return false
  }
  return true
}

function familyFailure(response, vars, actions) {
  const families = actions.map(({ action }) => action.offerKey.split(':')[0])
  const fields = (response.pendingOperations ?? []).flatMap((pending) => pending.items ?? []).flatMap((item) => item.fields)
  const suggested = fields.filter((field) => field.provenance === 'suggested')
  const has = (field) => suggested.some((entry) => entry.field === field)
  const requiredAction = { missed: ['restart', 'skip'], 'due-log': ['log'], 'goal-behind': ['goalLink', 'goalTarget'],
    empty: ['smallStep'], 'reminder-gap': ['reminder'], 'goal-gap': ['aim'], 'calendar-gap': ['calendar'] }[vars.offerFamily]
  if (requiredAction && !vars.offerExclusion && !families.some((family) => requiredAction.includes(family))) return 'Missing eligible family action.'
  const excluded = { resolved: ['log'], 'goal-on-track': ['goalLink', 'goalTarget'], stale: ['log', 'skip', 'restart', 'reminder', 'goalLink', 'goalTarget'] }[vars.offerFamily] ?? []
  if (families.some((family) => excluded.includes(family) || vars.offerExclusion?.includes(family))) return 'Excluded action was offered.'
  const repeat = fields.find((field) => field.field === 'repeat_reminder')?.proposedValue
  if (vars.offerFamily === 'repeat' && (!repeat || !Number.isInteger(repeat.interval_minutes)
    || repeat.interval_minutes <= 0
    || !((repeat.active_start == null && repeat.active_end == null)
      || text(repeat.active_start) && text(repeat.active_end)))) return 'Repeat reminder lacks its interval or active hours.'
  if (vars.offerFamily === 'repeat' && (!has('repeat_reminder') || fields.some((field) => field.field === 'frequency_quantity' && field.proposedValue != null && Number(field.proposedValue) !== 1))) return 'Missing repeat suggestion or interval-derived target.'
  if (['fixed-medication', 'ordinary-reading', 'unsupported-schedule'].includes(vars.offerFamily) && has('repeat_reminder')) return 'Ineligible repeat reminder.'
  if (vars.offerFamily === 'fixed-medication') {
    const times = fields.find((field) => field.field === 'scheduled_reminders')
    if (!times || (times.provenance != null && times.provenance !== 'requested') || !Array.isArray(times.proposedValue)
      || !times.proposedValue.every((entry) => typeof entry?.time === 'string')
      || !isDeepStrictEqual(times.proposedValue.map((entry) => entry.time.slice(0, 5)).sort(), ['08:00', '20:00'])) return 'Requested medication times changed.'
  }
  if (vars.offerFamily === 'bounded' && (!fields.some((field) => field.field === 'end_date' && field.proposedValue === vars.offerEndDate && (field.provenance == null || field.provenance === 'requested'))
    || !fields.some((field) => ['due_date', 'start_date'].includes(field.field) && field.proposedValue === vars.offerStartDate))) return 'Requested inclusive boundary changed.'
  if (vars.offerFamily === 'root' && suggested.some((field) => field.field === 'parent_habit_id')) return 'Explicit root placement received a suggested parent.'
  if (vars.offerFamily === 'parent' && !suggested.some((field) => field.field === 'parent_habit_id'
    && vars.fixtureEvidence?.habits?.some((habit) => habit.id === field.proposedValue))) return 'Suggested parent is missing or unowned.'
  if (vars.offerFamily === 'goal-link' && !suggested.some((field) => field.field === 'goal_ids'
    && Array.isArray(field.proposedValue) && field.proposedValue.length > 0
    && field.proposedValue.every((id) => vars.fixtureEvidence?.goals?.some((goal) => goal.id === id)))) return 'Suggested goal link is missing or unowned.'
  if (vars.offerFamily === 'dated-reminder' && !suggested.some((field) => reminders.includes(field.field))) return 'Missing removable dated-task reminder.'
  if (vars.offerFamily === 'metadata' && (!has('emoji') || !suggested.some((field) => ['tag_ids', 'tag_names'].includes(field.field)))) return 'Missing separately removable metadata suggestions.'
  if (vars.offerFamily === 'stale' && !(response.parts ?? []).some((part) => part.kind === 'periodInsight'
    && part.block.read?.completeness === 'stale' && part.block.read.recovery === 'refresh')) return 'Missing retained stale recovery state.'
  if (vars.offerFamily === 'multi-block' && !isDeepStrictEqual((response.parts ?? []).filter((part) => part.type === 'block').map((part) => part.kind), ['habitList', 'goalList'])) return 'Compound block order changed.'
  return null
}

export function proactiveOffers(output, context) {
  const vars = context.vars
  if (!vars.offerFamily) return offerResult(true, 'No proactive-offer policy requested.')
  const parsed = typeof output === 'string' ? JSON.parse(output) : output
  const response = parsed?.composition
  if (!response || !Array.isArray(response.parts) || !Array.isArray(parsed.trace?.calls)) return offerResult(false, 'Missing proactive-offer evidence.')
  const actions = offerActions(response)
  const enabled = vars.clientContext.supportsProactiveOffers === true
  if (actions.length > 1 || (!enabled && actions.length)) return offerResult(false, 'Unexpected or multiple unsolicited actions.')
  if (!actions.every((entry) => validAction(entry, vars) && groundedAction(entry, vars))) return offerResult(false, 'Malformed, stale or ungrounded next action.')
  if (vars.composition.mode === 'data' && response.parts.some((part) => part.type === 'block'
    && (!uuid(part.block?.read?.queryId) || !text(part.block.read.revision) || !text(part.block.read.refreshToken)))) return offerResult(false, 'Missing typed read identity or revision.')
  if ((response.followUps?.length ?? 0) || (response.followUpContext?.length ?? 0)) return offerResult(false, 'Proactive answer contains external follow-ups.')
  if (parsed.trace.calls.some((call) => toolWrites.get(call.name) === true && call.resultStatus === 'Succeeded')
    || (response.operations ?? []).some((operation) => toolWrites.get(operation.sourceName) === true && operation.status === 'Succeeded')) return offerResult(false, 'Unsolicited write executed.')
  if (!['preview-rejection', 'action-lifecycle'].includes(vars.offerFamily)
    && vars.composition.mode !== 'preview' && response.pendingOperations?.length) return offerResult(false, 'A read answer prepared an unsolicited write.')
  if (vars.offerFamily === 'crisis' && (actions.length || response.pendingOperations?.length)) return offerResult(false, 'Crisis answer contains a productivity offer.')
  const failure = previewFailure(response, enabled, parsed.trace.calls) ?? familyFailure(response, vars, actions)
  if (failure) return offerResult(false, failure)
  if (vars.offerRequireReadback && parsed.offerReadback?.pass !== true) return offerResult(false, parsed.offerReadback?.reason ?? 'Missing lifecycle or unchanged-state readback.')
  return offerResult(true, 'Typed actions, provenance, removal groups and persisted state matched.')
}
