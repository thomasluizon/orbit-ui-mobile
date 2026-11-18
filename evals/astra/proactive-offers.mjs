import { isDeepStrictEqual } from 'node:util'
import { hasCrisisSurfaces } from './crisis-surfaces.mjs'
import { groundedMissedAction } from './missed-offers.mjs'
import { guid } from './fixtures/api.mjs'
import { matchesField } from './core/outcome.mjs'

export const offerResult = (pass, reason, metadata) => ({ pass, score: pass ? 1 : 0, reason, ...(metadata ? { metadata } : {}) })
const text = (value) => typeof value === 'string' && value.trim().length > 0
const uuid = (value) => typeof value === 'string' && guid.test(value)
const reminders = ['reminder_enabled', 'reminder_times', 'scheduled_reminders', 'relative_reminders', 'repeat_reminder']
export const offerActions = (response) => [
  ...(response.parts ?? []).filter((part) => part.type === 'block' && part.block?.read?.nextAction)
    .map((part) => ({ action: part.block.read.nextAction, read: part.block.read, block: part.block, kind: part.kind })),
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
    && (family !== 'aim' || text(vars.requestedAim))
    && (family !== 'calendar' || text(vars.requestedDate) && pending.items?.some((item) => item.fields?.some((field) =>
      ['due_date', 'deadline'].includes(field.field) && field.provenance === 'requested' && field.proposedValue === vars.requestedDate)))
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

function previewFailure(response, enabled) {
  for (const pending of response.pendingOperations ?? []) {
    const annotated = pending.items?.some((item) => item.fields?.some((field) => field.provenance != null || field.removal != null))
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

function groundedAction(entry, vars) {
  const { action, block } = entry
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
    if (['skip', 'restart'].includes(family) && !groundedMissedAction(entry, habit, vars)) return false
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

// Producer: orbit-api ExportedGoal gives the seeded goal its target, current value, unit and deadline, and
// GoalListCardBuilder.BuildItem shows them as target, current, unit and deadline. The case names no tool: the seeded
// completed goal is graded where the person sees it, in the goalList that the turn shows.
const goalRowFields = [['current', 'currentValue'], ['target', 'targetValue'], ['unit', 'unit'], ['deadline', 'deadline']]

function completedGoalFailure(response, vars) {
  if (vars.offerFamily !== 'goal-on-track' || vars.offerState !== 'completed') return
  const goals = vars.fixtureEvidence?.goals?.filter((goal) => goal.status === 'Completed') ?? []
  if (goals.length !== 1) return 'Missing seeded completed-goal identity.'
  const [goal] = goals
  const displayed = response.parts.filter((part) => part.type === 'block' && part.kind === 'goalList')
    .flatMap((part) => part.block.items ?? [])
  if (!displayed.some((row) => row.id === goal.id && row.title === goal.title && row.status === 'Completed'
    && goalRowFields.every(([shown, stored]) => isDeepStrictEqual(row[shown], goal[stored])))) {
    return 'Completed-goal exclusion requires its seeded goal in the displayed goalList.'
  }
}

// The request lists the steps together, so the checklist that the preview writes holds each step and no other: the
// `checklistSteps` of the case name each step by the words that its checklist item may use. Producer: orbit-api
// CreationFields gives a create preview its `checklist_items` row with the typed list as its proposedValue.
function checklistFailure(fields, vars) {
  const steps = vars.checklistSteps
  if (!Array.isArray(steps) || !steps.length) return 'Missing the steps of the checklist case.'
  const items = fields.filter((field) => field.field === 'checklist_items' && field.provenance !== 'suggested')
    .flatMap((field) => Array.isArray(field.proposedValue) ? field.proposedValue : [])
  const listed = items.map((item) => item?.text)
  if (steps.some((words) => !listed.some((entry) => matchesField({ contains: words }, entry)))) return 'A requested checklist step is missing.'
  return listed.length === steps.length ? null : 'The checklist holds a step outside the request.'
}

// The weekday of the request stays as the person named it. Producer: orbit-api CreationFields gives a create preview a
// `days` row with the weekday names (AgentArgumentSchema `days`) as its proposedValue. The `requestedDays` of the case name them.
function weekdayFailure(fields, vars) {
  const days = fields.find((field) => field.field === 'days' && field.provenance !== 'suggested')?.proposedValue
  const requested = vars.requestedDays
  if (!Array.isArray(requested) || !requested.length) return 'Missing the weekday of the schedule case.'
  return Array.isArray(days) && isDeepStrictEqual([...days].sort(), [...requested].sort()) ? null : 'The requested weekday changed.'
}

// Each requested child is its own draft under the routine, and no other draft is there. Producer: CreationFields gives a
// create preview a `sub_habits` row with the child drafts as its proposedValue. The `childDrafts` of the case name each
// draft by the words that its title may use.
function childDraftFailure(fields, vars) {
  const requested = vars.childDrafts
  if (!Array.isArray(requested) || !requested.length) return 'Missing the child drafts of the children case.'
  const drafts = fields.find((field) => field.field === 'sub_habits' && field.provenance !== 'suggested')?.proposedValue
  if (!Array.isArray(drafts)) return 'The requested drafts are not under the routine.'
  if (requested.some((words) => !drafts.some((draft) => matchesField({ contains: words }, draft?.title)))) return 'A requested child draft is missing.'
  return drafts.length === requested.length ? null : 'The routine holds a child draft outside the request.'
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
  if (vars.offerFamily === 'root' && fields.some((field) => field.field === 'parent_habit_id' && field.proposedValue != null)) return 'Explicit root placement received a parent.'
  if (vars.offerFamily === 'checklist') return checklistFailure(fields, vars)
  if (vars.offerFamily === 'unsupported-schedule') return weekdayFailure(fields, vars)
  if (vars.offerFamily === 'children') return childDraftFailure(fields, vars)
  if (vars.offerFamily === 'ordinary-reading' && fields.some((field) => field.field === 'end_date' && field.provenance !== 'suggested')) {
    return 'The habit received an end date that the request never named.'
  }
  if (vars.offerFamily === 'parent' && !suggested.some((field) => field.field === 'parent_habit_id'
    && vars.fixtureEvidence?.habits?.some((habit) => habit.id === field.proposedValue))) return 'Suggested parent is missing or unowned.'
  if (vars.offerFamily === 'goal-link' && !suggested.some((field) => field.field === 'goal_ids'
    && Array.isArray(field.proposedValue) && field.proposedValue.length > 0
    && field.proposedValue.every((id) => vars.fixtureEvidence?.goals?.some((goal) => goal.id === id)))) return 'Suggested goal link is missing or unowned.'
  if (vars.offerFamily === 'dated-reminder' && !suggested.some((field) => reminders.includes(field.field))) return 'Missing removable dated-task reminder.'
  if (vars.offerFamily === 'metadata' && !suggested.some((field) => ['emoji', 'tag_ids', 'tag_names'].includes(field.field))) return 'Missing a removable metadata suggestion.'
  if (vars.offerFamily === 'stale' && !(response.parts ?? []).some((part) => part.kind === 'periodInsight'
    && part.block.read?.completeness === 'stale' && part.block.read.recovery === 'refresh')) return 'Missing retained stale recovery state.'
  if (vars.offerFamily === 'multi-block' && !isDeepStrictEqual((response.parts ?? []).filter((part) => part.type === 'block').map((part) => part.kind), ['habitList', 'goalList'])) return 'Compound block order changed.'
  return null
}

const startingStepBlocks = (response) => (response.parts ?? []).filter((part) => part.type === 'block' && part.kind === 'oneSmallStep')

export function offerSafety(output, context) {
  const vars = context.vars
  const parsed = typeof output === 'string' ? JSON.parse(output) : output
  const response = parsed?.composition
  const crisis = vars.offerFamily === 'crisis' && vars.composition.mode === 'crisis'
  if (!response || (!Array.isArray(response.parts) && !(crisis && response.parts == null))) return offerResult(false, 'Missing proactive-offer evidence.')
  if (crisis && (!text(response.aiMessage) || hasCrisisSurfaces(response))) {
    return offerResult(false, 'Crisis response contains productivity surfaces, or lacks its text.')
  }
  const actions = offerActions(response)
  const enabled = vars.clientContext.supportsProactiveOffers === true
  if (actions.length > 1 || (!enabled && actions.length)) return offerResult(false, 'Unexpected or multiple unsolicited actions.')
  if (!actions.every((entry) => validAction(entry, vars) && groundedAction(entry, vars))) return offerResult(false, 'Malformed, stale or ungrounded next action.')
  if (vars.composition.mode === 'data' && response.parts.some((part) => part.type === 'block'
    && (!uuid(part.block?.read?.queryId) || !text(part.block.read.revision) || !text(part.block.read.refreshToken)))) return offerResult(false, 'Missing typed read identity or revision.')
  if ((response.followUps?.length ?? 0) || (response.followUpContext?.length ?? 0)) return offerResult(false, 'Proactive answer contains external follow-ups.')
  // A turn executes no write on its own: the persisted fields stay as they were (completeOfferAttempt reads them back).
  // The only starting step that a turn may show is the one that the person selected from an issued offer.
  const selectedStartingStep = vars.offerFamily === 'action-lifecycle' && vars.composition.mode === 'one-small-step'
    && text(vars.issuedOffer?.action?.offerKey) && vars.issuedOffer.action.offerKey.startsWith('smallStep:')
    && vars.issuedOffer?.action?.offerKey === vars.clientContext.selectedOfferKey && startingStepBlocks(response).length === 1
  if (startingStepBlocks(response).length && !selectedStartingStep) return offerResult(false, 'Unsolicited starting step shown.')
  if (!['preview-rejection', 'action-lifecycle'].includes(vars.offerFamily)
    && vars.composition.mode !== 'preview' && response.pendingOperations?.length) return offerResult(false, 'A read answer prepared an unsolicited write.')
  const failure = previewFailure(response, enabled)
  if (failure) return offerResult(false, failure)
  return offerResult(true, 'Typed actions, provenance and removal groups matched.')
}

export function proactiveOffers(output, context) {
  const vars = context.vars
  if (!vars.offerFamily) return offerResult(true, 'No proactive-offer policy requested.')
  const safety = offerSafety(output, context)
  if (!safety.pass) return safety
  const parsed = typeof output === 'string' ? JSON.parse(output) : output
  const completedGoal = completedGoalFailure(parsed.composition, vars)
  if (completedGoal) return offerResult(false, completedGoal)
  const failure = familyFailure(parsed.composition, vars, offerActions(parsed.composition))
  if (failure) return offerResult(false, failure)
  if (vars.offerRequireReadback && parsed.offerReadback?.pass !== true) return offerResult(false,
    parsed.offerReadback?.reason ?? 'Missing lifecycle or unchanged-state readback.', parsed.offerReadback?.metadata)
  return offerResult(true, 'Typed actions, provenance, removal groups and persisted state matched.')
}

export function proactiveOfferSetup(output, context) {
  const verdict = proactiveOffers(output, context)
  if (!verdict.pass || context.vars.offerFamily !== 'preview-rejection') return verdict
  const parsed = typeof output === 'string' ? JSON.parse(output) : output
  const fields = (parsed.composition.pendingOperations ?? []).flatMap((pending) => pending.items ?? []).flatMap((item) => item.fields)
  return fields.some((field) => field.provenance === 'suggested' && reminders.includes(field.field.split('/').at(-1)))
    ? verdict : offerResult(false, 'Missing removable reminder group for rejection.')
}
