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
export function compareChanges(expected, actual, { records, accountDate }, answered) {
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
// held previews against the expected list. A read turn holds no preview and asks nothing.
export function gradePreview(output, vars) {
  if (output.unavailable) return verdict(false, output.error ?? 'The chat turn gave no evidence.', { unavailable: true })
  if (output.error) return verdict(false, output.error)
  const { expected } = vars.core
  const questions = output.questionsBeforePreview
  const previews = output.previews ?? []
  if (expected.read) {
    if (previews.length) return verdict(false, 'The read request held a preview of a change.')
    return output.asked ? verdict(false, 'The read request ended in a question card.')
      : verdict(true, 'The read turn held no preview and asked nothing.')
  }
  const { min = 0, max = 0 } = expected.questions ?? {}
  if (questions > max) return verdict(false, `The assistant asked ${questions} time(s) before a preview; the request allows ${max}.`)
  if (output.answerFailure) return verdict(false, output.answerFailure, output.graderLimit ? { graderLimit: true } : {})
  if (!previews.length) return verdict(false, `No preview came after ${questions} question(s).`)
  if (questions < min) return verdict(false, 'The assistant held a change without the question that the request needs.')
  if (!withinRange(previews.length, expected.previews, 1)) return verdict(false, `The request is held in ${previews.length} previews.`)
  const { changes, unclassified } = changeList(previews)
  if (unclassified.length) {
    return verdict(false, `The grader cannot classify a held preview: ${unclassified.join(', ')}.`, { graderLimit: true })
  }
  const comparison = compareChanges(expected.changes, changes, { records: vars.core.records, accountDate: vars.accountDate }, questions > 0)
  return comparison.failure ? verdict(false, comparison.failure)
    : verdict(true, 'The held previews hold exactly the requested changes.', { matched: comparison.matched })
}

// What the readback compares of each stored habit: its identity, its title and whether it is logged on the account date.
export const savedRecords = (habits, accountDate) => habits.map((habit) => ({ id: habit.id, title: habit.title,
  logged: habit.logs.some((log) => log.date === accountDate && log.value > 0) })).toSorted((left, right) => left.id.localeCompare(right.id))

// The saved state after approval, read back from the account: each deleted record is gone, each updated title and each
// log is saved, each created record exists once, and every other record is as it was.
function gradeSavedState(readback, matched, vars) {
  if (!readback) return verdict(false, 'The approved preview has no saved state readback.')
  if (readback.error) return verdict(false, readback.error, readback.unavailable ? { unavailable: true } : {})
  const before = savedRecords(readback.baseline, vars.accountDate)
  if (JSON.stringify(savedRecords(readback.held, vars.accountDate)) !== JSON.stringify(before)) {
    return verdict(false, 'The held preview changed the account before its approval.')
  }
  const wanted = new Map(before.map((habit) => [habit.id, { ...habit }]))
  const creates = []
  for (const { expected, held } of matched) {
    for (const change of held) {
      if (expected.kind === 'create') creates.push(expected)
      else if (expected.kind === 'delete') wanted.delete(change.target)
      else if (expected.kind === 'log') wanted.get(change.target).logged = true
      else if (expected.kind === 'update' && typeof expected.fields?.title === 'string') wanted.get(change.target).title = expected.fields.title
      else return verdict(false, `The grader cannot read back a saved ${expected.kind}.`, { graderLimit: true })
    }
  }
  const after = savedRecords(readback.after, vars.accountDate)
  const created = after.filter((habit) => !before.some((stored) => stored.id === habit.id))
  const kept = after.filter((habit) => before.some((stored) => stored.id === habit.id))
  if (kept.length !== wanted.size || kept.some((habit) => JSON.stringify(habit) !== JSON.stringify(wanted.get(habit.id)))) {
    return verdict(false, 'The saved records differ from the approved changes.')
  }
  const titled = creates.every((expected) => !expected.fields?.title
    || created.some((habit) => matchesField(expected.fields.title, habit.title, vars.accountDate)))
  return created.length === creates.length && titled ? verdict(true, 'The saved state matches the approved changes.')
    : verdict(false, 'The created records differ from the approved changes.')
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
