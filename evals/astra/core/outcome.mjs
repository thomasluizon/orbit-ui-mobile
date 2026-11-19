import { changeList } from './change-list.mjs'
import { dateOffset } from '../fixtures/reset.mjs'

const verdict = (pass, reason, metadata = {}) => ({ pass, score: pass ? 1 : 0, reason, metadata })
const decode = (output) => typeof output === 'string' ? JSON.parse(output) : output
const normalize = (value) => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[^a-z0-9]+/gu, ' ').trim()
const sameMembers = (left, right) => left.length === right.length && left.every((id) => right.includes(id))
const tally = (changes) => Object.entries(Object.groupBy(changes, (change) => change.kind))
  .map(([kind, members]) => `${kind} ${members.length}`).join(', ') || 'no change'

// A checklist as the preview shows it (the JSON text of its items, each with is_checked) and as the account stores it
// (each item with isChecked), in one form: the text and the checked state of each item, in order.
function checklistOf(value) {
  try {
    const items = typeof value === 'string' ? JSON.parse(value) : value
    return Array.isArray(items) ? items.map((item) => ({ text: item.text, checked: (item.is_checked ?? item.isChecked) === true })) : null
  } catch {
    return null
  }
}

// The value a field must take: an exact string, a text that holds one of several words, a date counted from the
// account date, a date within a span of days counted from it, a month and day in any year, a clock time to the minute,
// one of several exact strings, a whole checklist, or an absent field that otherwise holds the value of the inner
// expectation. A preview has no row for an argument that the model omitted, so an `optional` field passes when it is
// absent.
export function matchesField(expected, value, accountDate) {
  if (typeof expected === 'string') return value === expected
  if (expected.optional !== undefined) return value == null || matchesField(expected.optional, value, accountDate)
  if (expected.oneOf) return expected.oneOf.includes(value ?? null)
  if (expected.contains) return expected.contains.some((text) => normalize(value).includes(normalize(text)))
  if (expected.daysFromToday !== undefined) return value === dateOffset(accountDate, expected.daysFromToday)
  if (expected.withinDays) {
    const [from, to] = expected.withinDays
    return /^\d{4}-\d{2}-\d{2}$/u.test(value ?? '') && value >= dateOffset(accountDate, from) && value <= dateOffset(accountDate, to)
  }
  if (expected.checklist) return JSON.stringify(checklistOf(value)) === JSON.stringify(expected.checklist)
  if (expected.monthDay) return /^\d{4}-\d{2}-\d{2}$/u.test(value ?? '') && value.slice(5) === expected.monthDay
  if (expected.time) return typeof value === 'string' && value.slice(0, 5) === expected.time
  throw new Error('Unknown field expectation in the core set.')
}

// How a saved record names each field of a preview. Producer: orbit-api ExportedHabit, the habit row of eval/snapshot,
// holds the title, the next due date and the frequency. Only the habit detail (GET habits/{id}, the shared
// habitDetailSchema) holds the due time, so the readback reads it for a created record alone.
const savedField = {
  title: (habit) => habit.title,
  due_date: (habit) => habit.dueDate,
  due_time: (habit) => habit.dueTime,
  frequency_unit: (habit) => habit.frequencyUnit,
  frequency_quantity: (habit) => habit.frequencyQuantity == null ? null : String(habit.frequencyQuantity),
  checklist_items: (habit) => habit.checklistItems,
}
export const detailFields = ['due_time']

// The change whose saved state the readback cannot read: a kind that leaves no mark in the snapshot, a field that no
// saved record names, or a field of an existing record that only the habit detail holds. The core set refuses such an
// expected change when it loads (core/corpus.mjs), so the grader never meets one.
export function unreadable({ kind, fields = {} }) {
  if (kind === 'delete' || kind === 'log') return null
  if (kind !== 'create' && kind !== 'update') return kind
  const field = Object.keys(fields).find((name) => !savedField[name] || (kind === 'update' && detailFields.includes(name)))
  return field ? `${kind} of ${field}` : null
}

// The records an expected change names. A count over a set leaves the choice of members open until the person answers
// a question; `whenAnswered` then gives the positions that the answer decides.
function expectedTargets(targets, records, answered) {
  if (targets.record) return { ids: [records[targets.record]] }
  if (targets.records) return { ids: targets.records.map((name) => records[name]) }
  const set = records[targets.of]
  const positions = targets.positions ?? (answered ? targets.whenAnswered : undefined)
  if (positions) return { ids: positions.map((position) => set[position]) }
  return targets.count === undefined ? { ids: [...set] } : { among: set, count: targets.count }
}

// The value of a field in a change. A field that the request lets a record keep (`mayStay`) is the value the preview
// shows it holding when it is no change (`kept`).
const heldValue = (expected, change, field) => change.fields[field] ?? (expected.fields[field]?.mayStay ? change.kept?.[field] : undefined)

function fieldFailure(expected, change, accountDate) {
  const changed = Object.keys(change.fields)
  const wanted = Object.keys(expected.fields ?? {}).filter((field) => changed.includes(field) || heldValue(expected, change, field) === undefined)
  if (expected.kind === 'update' && !sameMembers(changed, wanted)) {
    return `changes ${changed.join(', ') || 'no field'} where the request changes ${Object.keys(expected.fields ?? {}).join(', ')}`
  }
  const wrong = Object.keys(expected.fields ?? {}).find((field) => !matchesField(expected.fields[field], heldValue(expected, change, field), accountDate))
  return wrong ? `gives ${wrong} the value ${JSON.stringify(heldValue(expected, change, wrong) ?? null)}` : null
}

// How many of the held changes leave the habit due on the account date, counting a habit that stays due then. A request
// states the number it needs (`dueToday`: a count, or a span of min and max).
function dueTodayFailure(expected, held, accountDate) {
  if (expected.dueToday === undefined) return null
  const count = held.filter((change) => (change.fields.due_date ?? change.kept?.due_date) === accountDate).length
  return withinRange(count, expected.dueToday, 0) ? null : `leaves ${count} of ${held.length} due today, and the request needs ${JSON.stringify(expected.dueToday)}`
}

// Compares the change list of the held previews with the expected list: each expected change is held over exactly its
// records with exactly its fields, no record is in two changes, and nothing else is held. Returns the changes each
// expected entry matched, so the saved state after approval is read back against the same records.
function compareChanges(expected, actual, { records, accountDate }, answered) {
  const targets = actual.map((change) => change.target).filter(Boolean)
  if (new Set(targets).size !== targets.length) return { failure: 'One record is in two changes of the preview.' }
  const remaining = [...actual]
  const matched = []
  const needs = `The request needs ${expected.map((change) => change.kind).join(' and ')}; the preview holds ${tally(actual)}.`
  for (const change of expected) {
    const wanted = change.targets ? expectedTargets(change.targets, records, answered) : null
    const pool = wanted?.ids ?? wanted?.among
    const held = wanted ? remaining.filter((candidate) => candidate.kind === change.kind && pool.includes(candidate.target))
      : remaining.filter((candidate) => candidate.kind === change.kind && !fieldFailure(change, candidate, accountDate)).slice(0, 1)
    const ids = held.map((candidate) => candidate.target)
    if (wanted ? (wanted.ids ? !sameMembers(ids, wanted.ids) : ids.length !== wanted.count) : !held.length) {
      return { failure: `The preview does not ${change.kind} exactly the records of the request. ${needs}` }
    }
    for (const candidate of held) {
      const wrong = fieldFailure(change, candidate, accountDate)
      if (wrong) return { failure: `A ${change.kind} of the preview ${wrong}.` }
      remaining.splice(remaining.indexOf(candidate), 1)
    }
    const spread = dueTodayFailure(change, held, accountDate)
    if (spread) return { failure: `The ${change.kind} of the preview ${spread}.` }
    matched.push({ expected: change, held })
  }
  return remaining.length ? { failure: `The preview holds a change outside the request. ${needs}` } : { matched }
}

function withinRange(count, range, fallback) {
  const { min = fallback, max = fallback } = typeof range === 'number' ? { min: range, max: range } : range ?? {}
  return count >= min && count <= max
}

// A request that the server must refuse: the turn ends with the HTTP status and the error code of the case.
function gradeRefusal(output, vars) {
  const wanted = `HTTP ${vars.expectedHttpStatus} (${vars.expectedErrorCode})`
  if (!output.refused) return verdict(false, output.error ?? `The request must be refused with ${wanted}, and the assistant answered it.`)
  const { status, code } = output.refused
  return status === vars.expectedHttpStatus && code === vars.expectedErrorCode ? verdict(true, `The request was refused with ${wanted}.`)
    : verdict(false, `The request was refused with HTTP ${status} (${code}); the case expects ${wanted}.`)
}

// The outcome of the turns before any approval: the questions that came before the preview, and the change list of the
// held previews against the expected list. A read turn holds no preview and no card that asks the person. A turn that
// must end in a question holds a card that asks and no preview. A refusal is the status and the code of the case and no
// answer. A preview that the grader cannot classify is a limit of the grader and no verdict on the assistant.
export function gradePreview(output, vars) {
  if (output.unavailable) return verdict(false, output.error ?? 'The chat turn gave no evidence.', { unavailable: true })
  const { expected } = vars.core
  if (expected.refusal) return gradeRefusal(output, vars)
  if (output.error) return verdict(false, output.error)
  const questions = output.questionsBeforePreview
  const previews = output.previews ?? []
  if (expected.read) {
    if (previews.length) return verdict(false, 'The read request held a preview of a change.')
    return output.asked ? verdict(false, 'The read request ended in a card that asks the person to act.')
      : verdict(true, 'The read turn held no preview and no card.')
  }
  if (expected.question) {
    if (previews.length) return verdict(false, 'The request must end in a question, and the reply held a preview of a change.')
    return output.asked ? verdict(true, 'The turn ended in a question card and held no preview.')
      : verdict(false, 'The request must end in a question card, and the reply shows none.')
  }
  const { min = 0, max = 0 } = expected.questions ?? {}
  if (questions > max) return verdict(false, `The assistant asked ${questions} time(s) before a preview; the request allows ${max}.`)
  if (output.answerFailure) return verdict(false, output.answerFailure, output.graderLimit ? { graderLimit: true } : {})
  if (!previews.length) return verdict(false, `No preview came after ${questions} question(s).`)
  if (questions < min) return verdict(false, 'The assistant held a change without the question that the request needs.')
  if (!withinRange(previews.length, expected.previews, 1)) return verdict(false, `The request is held in ${previews.length} previews.`)
  const { changes, unclassified } = changeList(previews, output.written ?? null,
    { nestedCreates: vars.core.nestedCreates === true, reuses: vars.core.reuses === true })
  if (unclassified.length) {
    return verdict(false, `The grader cannot classify a held preview: ${unclassified.join(', ')}.`, { graderLimit: true })
  }
  // A missing trace is a missing precondition of the run, as for a card answer: the attempt gives no evidence.
  if (changes.some((change) => Object.keys(change.undetermined).length)) {
    return verdict(false, 'The preview shows a `stored` field, and the turn returned no eval trace to tell a field that a '
      + 'held write sets or clears from one that the server derives.', { unavailable: true })
  }
  const comparison = compareChanges(expected.changes, changes, { records: vars.core.records, accountDate: vars.accountDate }, questions > 0)
  return comparison.failure ? verdict(false, comparison.failure)
    : verdict(true, 'The held previews hold exactly the requested changes.', { matched: comparison.matched })
}

// What the readback compares of each stored habit: its identity, its title, its frequency and whether it is logged on
// the account date. The next due date moves when a habit is logged, so it is read only where a change names it.
export const savedRecords = (habits, accountDate) => habits.map((habit) => ({ id: habit.id, title: habit.title,
  frequency_unit: savedField.frequency_unit(habit) ?? null, frequency_quantity: savedField.frequency_quantity(habit),
  logged: habit.logs.some((log) => log.date === accountDate && log.value > 0) })).toSorted((left, right) => left.id.localeCompare(right.id))

// A value in the form that a preview row and a saved record can share: a one-time habit has no frequency unit when it is
// saved, and a checklist is its items in order.
const comparable = (field, value) => field === 'checklist_items' ? JSON.stringify(checklistOf(value))
  : field === 'frequency_unit' && value === 'OneTime' ? null : value ?? null

// The first field of an updated record that the preview showed (changed, or kept where it was) and that the saved record
// holds with another value. A field that only the habit detail holds is not read for an existing record.
function approvedFailure({ fields, kept = {} }, habit) {
  const shown = { ...kept, ...fields }
  const wrong = Object.keys(shown).find((field) => savedField[field] && !detailFields.includes(field)
    && comparable(field, savedField[field](habit)) !== comparable(field, shown[field]))
  return wrong ? `saves ${wrong} as ${JSON.stringify(savedField[wrong](habit) ?? null)}, and the approved preview shows ${JSON.stringify(shown[wrong])}` : null
}

// The first field that an update preview shows for a stored record (changed, or kept) and that the account holds with another
// value than the baseline: the preview wrote before the person decided, or the rejection saved it.
function movedField({ target, fields, kept = {} }, habits, baseline) {
  const habit = habits.find((saved) => saved.id === target)
  const before = baseline.find((saved) => saved.id === target)
  if (!habit || !before) return null
  return Object.keys({ ...kept, ...fields }).find((field) => savedField[field] && !detailFields.includes(field)
    && comparable(field, savedField[field](habit)) !== comparable(field, savedField[field](before))) ?? null
}

// The first field that the request names and the saved record holds with another value. A field that no saved record
// names (the parent of a create: the snapshot row holds none) is graded on the preview alone.
function savedFailure(expected, habit, accountDate) {
  const wrong = Object.keys(expected.fields ?? {}).filter((field) => savedField[field])
    .find((field) => !matchesField(expected.fields[field], savedField[field](habit), accountDate))
  return wrong ? `gives ${wrong} the value ${JSON.stringify(savedField[wrong](habit) ?? null)}` : null
}

// Each offered draft of the approved preview is saved as one new record with its title. Each expected create is saved as
// one other new record that holds each field the request names, and no other record is new.
function gradeCreated(creates, created, drafts, accountDate) {
  const differ = verdict(false, 'The created records differ from the approved changes.')
  const unmatched = [...created]
  for (const title of drafts) {
    const index = unmatched.findIndex((habit) => habit.title === title)
    if (index < 0) return differ
    unmatched.splice(index, 1)
  }
  for (const expected of creates) {
    const index = unmatched.findIndex((habit) => !savedFailure(expected, habit, accountDate))
    if (index < 0 && unmatched.length) return verdict(false, `A saved create ${savedFailure(expected, unmatched[0], accountDate)}.`)
    if (index < 0) return differ
    unmatched.splice(index, 1)
  }
  return unmatched.length ? differ : verdict(true, 'The saved state matches the approved changes.')
}

// The saved state after approval, read back from the account: each deleted record is gone, each log is saved, each
// updated and each created record holds each field the request names, and every other record is as it was. The person
// approves the preview as shown: an updated record holds each value that its rows show, requested, offered or derived
// (AddChanges writes them in the stored format), and each draft that the preview offers is a new record.
function gradeSavedState(readback, matched, vars) {
  if (!readback) return verdict(false, 'The approved preview has no saved state readback.')
  if (readback.error) return verdict(false, readback.error, readback.unavailable ? { unavailable: true } : {})
  const date = vars.accountDate
  const before = savedRecords(readback.baseline, date)
  const named = matched.flatMap(({ expected, held }) => held.map((change) => ({ ...change, expected })))
    .filter(({ expected }) => expected.kind === 'update')
  if (JSON.stringify(savedRecords(readback.held, date)) !== JSON.stringify(before)
    || named.some((change) => movedField(change, readback.held, readback.baseline))) {
    return verdict(false, 'The held preview changed the account before its approval.')
  }
  const rejected = vars.core.decision === 'reject'
  const moved = rejected ? named.map((change) => movedField(change, readback.after, readback.baseline)).find(Boolean) : null
  if (moved) return verdict(false, `The rejected preview changed the account: it saved ${moved}.`)
  const differ = verdict(false, 'The saved records differ from the approved changes.')
  const changes = rejected ? [] : matched.flatMap(({ expected, held }) => held.map((change) => ({ ...change, expected })))
  const wanted = new Map(before.map((habit) => [habit.id, { ...habit }]))
  for (const { expected, target } of changes) {
    if (expected.kind === 'delete') wanted.delete(target)
    if (expected.kind === 'log') wanted.get(target).logged = true
  }
  const kept = readback.after.filter((habit) => before.some((stored) => stored.id === habit.id))
  if (kept.length !== wanted.size) return differ
  for (const { expected, target, fields, offered, derived, ...change } of changes.filter(({ expected }) => expected.kind === 'update')) {
    const habit = kept.find((saved) => saved.id === target)
    const wrong = habit ? savedFailure(expected, habit, date) ?? approvedFailure({ fields, kept: change.kept }, habit) : null
    if (wrong) return verdict(false, `A saved update ${wrong}.`)
    const shown = { ...derived, ...offered, ...fields }
    for (const field of Object.keys(shown).filter((name) => habit && name in wanted.get(target))) wanted.get(target)[field] = shown[field]
  }
  if (savedRecords(kept, date).some((habit) => JSON.stringify(habit) !== JSON.stringify(wanted.get(habit.id)))) return differ
  return gradeCreated(changes.filter(({ expected }) => expected.kind === 'create').map(({ expected }) => expected),
    readback.after.filter((habit) => !kept.includes(habit)), changes.flatMap((change) => change.drafts), date)
}

// A turn sent again with its turn key is the same turn: the server replays it and holds no second preview.
function gradeResend(resend, previews) {
  if (!resend) return verdict(false, 'The turn was not sent again.')
  if (resend.error) return verdict(false, resend.error, resend.unavailable ? { unavailable: true } : {})
  const first = previews.map((preview) => preview.id)
  return resend.replayed === true && sameMembers(resend.previewIds, first) && resend.pendingCount === first.length
    ? verdict(true, 'The turn sent again was replayed and held no second preview.')
    : verdict(false, 'The turn sent again was not replayed as the same turn, or it held a second preview.')
}

// promptfoo assertion: the whole outcome of one attempt.
export function outcome(output, context) {
  const attempt = decode(output)
  const vars = context.vars
  const preview = gradePreview(attempt, vars)
  if (!preview.pass || vars.core.expected.read) return { ...preview, metadata: { ...preview.metadata, matched: undefined } }
  if (vars.core.resend) {
    const resent = gradeResend(attempt.resend, attempt.previews)
    if (!resent.pass) return resent
  }
  return gradeSavedState(attempt.readback, preview.metadata.matched, vars)
}
