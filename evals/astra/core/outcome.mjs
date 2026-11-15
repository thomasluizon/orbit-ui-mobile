import { changeList } from './change-list.mjs'
import { dateOffset } from '../fixtures/reset.mjs'

const verdict = (pass, reason, metadata = {}) => ({ pass, score: pass ? 1 : 0, reason, metadata })
const decode = (output) => typeof output === 'string' ? JSON.parse(output) : output
const normalize = (value) => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[^a-z0-9]+/gu, ' ').trim()
const sameMembers = (left, right) => left.length === right.length && left.every((id) => right.includes(id))
const tally = (changes) => Object.entries(Object.groupBy(changes, (change) => change.kind))
  .map(([kind, members]) => `${kind} ${members.length}`).join(', ') || 'no change'

// The value a field must take: an exact string, a text that holds one of several words, a date counted from the
// account date, a month and day in any year, or a clock time to the minute.
export function matchesField(expected, value, accountDate) {
  if (typeof expected === 'string') return value === expected
  if (expected.contains) return expected.contains.some((text) => normalize(value).includes(normalize(text)))
  if (expected.daysFromToday !== undefined) return value === dateOffset(accountDate, expected.daysFromToday)
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
}
export const detailFields = ['due_time']

// The change whose saved state the readback cannot read: a kind that leaves no mark in the snapshot, a field that no
// saved record names, or a field of an existing record that only the habit detail holds.
function unreadable({ kind, fields = {} }) {
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

function fieldFailure(expected, change, accountDate) {
  const wanted = Object.keys(expected.fields ?? {})
  const changed = Object.keys(change.fields)
  if (expected.kind === 'update' && !sameMembers(changed, wanted)) {
    return `changes ${changed.join(', ') || 'no field'} where the request changes ${wanted.join(', ')}`
  }
  const wrong = wanted.find((field) => !matchesField(expected.fields[field], change.fields[field], accountDate))
  return wrong ? `gives ${wrong} the value ${JSON.stringify(change.fields[wrong] ?? null)}` : null
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
      : remaining.filter((candidate) => candidate.kind === 'create' && !fieldFailure(change, candidate, accountDate)).slice(0, 1)
    const ids = held.map((candidate) => candidate.target)
    if (wanted ? (wanted.ids ? !sameMembers(ids, wanted.ids) : ids.length !== wanted.count) : !held.length) {
      return { failure: `The preview does not ${change.kind} exactly the records of the request. ${needs}` }
    }
    for (const candidate of held) {
      const wrong = fieldFailure(change, candidate, accountDate)
      if (wrong) return { failure: `A ${change.kind} of the preview ${wrong}.` }
      remaining.splice(remaining.indexOf(candidate), 1)
    }
    matched.push({ expected: change, held })
  }
  return remaining.length ? { failure: `The preview holds a change outside the request. ${needs}` } : { matched }
}

function withinRange(count, range, fallback) {
  const { min = fallback, max = fallback } = typeof range === 'number' ? { min: range, max: range } : range ?? {}
  return count >= min && count <= max
}

// The outcome of the turns before any approval: the questions that came before the preview, and the change list of the
// held previews against the expected list. A read turn holds no preview and no card that asks the person. A preview that the grader
// cannot classify, or whose saved state it cannot read back, is a limit of the grader and no verdict on the assistant.
export function gradePreview(output, vars) {
  if (output.unavailable) return verdict(false, output.error ?? 'The chat turn gave no evidence.', { unavailable: true })
  if (output.error) return verdict(false, output.error)
  const { expected } = vars.core
  const questions = output.questionsBeforePreview
  const previews = output.previews ?? []
  if (expected.read) {
    if (previews.length) return verdict(false, 'The read request held a preview of a change.')
    return output.asked ? verdict(false, 'The read request ended in a card that asks the person to act.')
      : verdict(true, 'The read turn held no preview and no card.')
  }
  const { min = 0, max = 0 } = expected.questions ?? {}
  if (questions > max) return verdict(false, `The assistant asked ${questions} time(s) before a preview; the request allows ${max}.`)
  if (output.answerFailure) return verdict(false, output.answerFailure, output.graderLimit ? { graderLimit: true } : {})
  if (!previews.length) return verdict(false, `No preview came after ${questions} question(s).`)
  if (questions < min) return verdict(false, 'The assistant held a change without the question that the request needs.')
  if (!withinRange(previews.length, expected.previews, 1)) return verdict(false, `The request is held in ${previews.length} previews.`)
  const { changes, unclassified } = changeList(previews, output.cleared ?? null)
  if (unclassified.length) {
    return verdict(false, `The grader cannot classify a held preview: ${unclassified.join(', ')}.`, { graderLimit: true })
  }
  // A missing trace is a missing precondition of the run, as for a card answer: the attempt gives no evidence.
  if (changes.some((change) => Object.keys(change.undetermined).length)) {
    return verdict(false, 'The preview shows a field that the model did not write, and the turn returned no eval trace '
      + 'to tell a field that the model clears from one that the server derives.', { unavailable: true })
  }
  const comparison = compareChanges(expected.changes, changes, { records: vars.core.records, accountDate: vars.accountDate }, questions > 0)
  if (comparison.failure) return verdict(false, comparison.failure)
  const unread = expected.changes.map(unreadable).find(Boolean)
  return unread ? verdict(false, `The grader cannot read back a saved ${unread}.`, { graderLimit: true })
    : verdict(true, 'The held previews hold exactly the requested changes.', { matched: comparison.matched })
}

// What the readback compares of each stored habit: its identity, its title, its frequency and whether it is logged on
// the account date. The next due date moves when a habit is logged, so it is read only where a change names it.
export const savedRecords = (habits, accountDate) => habits.map((habit) => ({ id: habit.id, title: habit.title,
  frequency_unit: savedField.frequency_unit(habit) ?? null, frequency_quantity: savedField.frequency_quantity(habit),
  logged: habit.logs.some((log) => log.date === accountDate && log.value > 0) })).toSorted((left, right) => left.id.localeCompare(right.id))

// The first field that the request names and the saved record holds with another value.
function savedFailure(expected, habit, accountDate) {
  const wrong = Object.keys(expected.fields ?? {}).find((field) => !matchesField(expected.fields[field], savedField[field](habit), accountDate))
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
  if (JSON.stringify(savedRecords(readback.held, date)) !== JSON.stringify(before)) {
    return verdict(false, 'The held preview changed the account before its approval.')
  }
  const differ = verdict(false, 'The saved records differ from the approved changes.')
  const changes = matched.flatMap(({ expected, held }) => held.map((change) => ({ ...change, expected })))
  const wanted = new Map(before.map((habit) => [habit.id, { ...habit }]))
  for (const { expected, target } of changes) {
    if (expected.kind === 'delete') wanted.delete(target)
    if (expected.kind === 'log') wanted.get(target).logged = true
  }
  const kept = readback.after.filter((habit) => before.some((stored) => stored.id === habit.id))
  if (kept.length !== wanted.size) return differ
  for (const { expected, target, fields, offered, derived } of changes.filter(({ expected }) => expected.kind === 'update')) {
    const habit = kept.find((saved) => saved.id === target)
    const wrong = habit ? savedFailure(expected, habit, date) : null
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
