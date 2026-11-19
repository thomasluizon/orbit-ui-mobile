import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { outcome } from '../client-path.mjs'
import { composition } from '../composition.mjs'
import { askGrader } from '../grader-provider.mjs'
import { TOOL_NAME_KEYS, corpusTests, gradedByOutcome } from '../grade-method.mjs'
import { answered, children, combined, deletes, parent, renames, sameTitleHabits, sameTitleRecords, withPreview } from './fixtures/same-title-account.mjs'
import { streams } from './fixtures/same-title-streams.mjs'
import { accountDate, addDays, attempt, caseOf, corpus, itemOf, previewOf, storedHabit, turnOf } from './fixtures/lifecycle-case.mjs'

vi.mock('../grader-provider.mjs', async (original) => ({ ...await original(), askGrader: vi.fn() }))
// No offline test spends a model call: the read of a card question that asks about both halves is a stub that reads the deleted half.
beforeEach(() => { vi.mocked(askGrader).mockReset().mockResolvedValue({ value: { half: 'deleted' } }) })

const lifecycleId = /^(same-title-|composition-(one-small-step|restart|brain-dump|suggestions))|^brain-dump-/u
const lifecycle = corpus.filter((entry) => lifecycleId.test(entry.metadata.id))

describe('the lifecycle families of the launch corpus', () => {
  it('holds the 62 cases of the five groups, each id once', () => {
    const count = (pattern) => lifecycle.filter((entry) => pattern.test(entry.metadata.id)).length
    expect([count(/^same-title-/u), count(/^composition-one-small-step/u), count(/^composition-restart/u), count(/^brain-dump-/u), count(/^composition-suggestions/u)])
      .toEqual([30, 12, 8, 6, 6])
    expect(new Set(lifecycle.map((entry) => entry.metadata.id)).size).toBe(62)
  })

  it('holds no tool-name key in its own turn or in its setup, and no policy of a deleted tool-name module', () => {
    for (const entry of lifecycle) {
      const { vars } = entry
      for (const key of TOOL_NAME_KEYS) expect(vars.expectations?.[key], `${entry.metadata.id} ${key}`).toBeUndefined()
      expect(vars.expectations, entry.metadata.id).toBeUndefined()
      expect(vars.setup?.expectations, entry.metadata.id).toBeUndefined()
      for (const key of ['sameTitleSet', 'restart', 'brainDump']) expect(vars[key], `${entry.metadata.id} ${key}`).toBeUndefined()
    }
  })

  // `sameTitleSet` is no row: core/answers.mjs builds it at run time for the card check of the same-title cases.
  it.each(['restart', 'brainDump'])('leaves no module outside the tests that reads vars.%s, which no case holds', (key) => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const reads = new RegExp(`\\bvars\\??\\.${key}\\b|\\bvars\\[['"]${key}['"]\\]|\\{[^}]*\\b${key}\\b[^}]*\\}\\s*=\\s*(?:\\w+\\.)?vars\\b`, 'u')
    const readers = readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((file) => file.isFile() && file.name.endsWith('.mjs'))
      .map((file) => join(file.parentPath, file.name))
      .filter((path) => !/[\\/](__tests__|node_modules|reports)[\\/]/u.test(path))
      .filter((path) => reads.test(readFileSync(path, 'utf8')))
    expect(readers.map((path) => path.slice(root.length))).toEqual([])
  })

  it('states an outcome for each case except the two that refine a draft on the refine route', () => {
    const without = lifecycle.filter((entry) => !gradedByOutcome(entry.vars)).map((entry) => entry.metadata.id)
    expect(without).toEqual(['composition-suggestions-refine-en', 'composition-suggestions-refine-pt-BR'])
    for (const entry of lifecycle.filter((item) => item.metadata.family === 'suggestions-refine')) expect(entry.vars.setup.outcome).toEqual({ read: true })
  })

  it('counts the outcome forms: 48 write cases, 12 read cases, no question case and no refusal case', () => {
    const form = (entry) => entry.vars.outcome?.changes ? 'write' : entry.vars.outcome?.read ? 'read' : entry.vars.outcome?.question ? 'question'
      : entry.vars.outcome?.refusal ? 'refusal' : 'refine'
    expect(Object.entries(Object.groupBy(lifecycle, form)).map(([name, members]) => [name, members.length]).toSorted())
      .toEqual([['read', 12], ['refine', 2], ['write', 48]])
  })

  it('gives each converted case the outcome grade and its composition, and a read case its rubric too', () => {
    const tests = corpusTests()
    const write = tests.find((test) => test.metadata.id === 'same-title-split-en')
    expect(write.assert.map((assertion) => assertion.metric)).toEqual(['outcome', 'composition'])
    const read = tests.find((test) => test.metadata.id === 'composition-suggestions-en')
    expect(read.assert.map((assertion) => assertion.metric)).toEqual(['outcome', 'composition', 'finalAnswer'])
    const refine = tests.find((test) => test.metadata.id === 'composition-suggestions-refine-en')
    expect(refine.options).toBeUndefined()
  })

  it('keeps no rubric on a write case and each rubric of a read case', () => {
    for (const entry of lifecycle.filter((item) => item.vars.outcome?.changes)) expect(entry.vars.rubric, entry.metadata.id).toBeUndefined()
    for (const entry of lifecycle.filter((item) => item.vars.outcome?.read)) expect(entry.vars.rubric, entry.metadata.id).toBeTruthy()
  })
})


describe('a same-title case', () => {
  it('passes a preview of the requested split and reads the saved children back after the approval', async () => {
    const { verdict, fixture } = await attempt('same-title-card-en', { replies: answered, habits: sameTitleHabits, records: sameTitleRecords })
    expect(verdict).toMatchObject({ pass: true, reason: 'The saved state matches the approved changes.' })
    expect(fixture.calls.map((call) => call.path.split('/').at(-1))).toEqual(['snapshot', 'confirm', 'execute', 'snapshot'])
    expect(fixture.state.map((habit) => habit.title)).toEqual(['Water', 'Water - 1.18L', 'Water - 1.18L', 'Water - 1.18L', 'Water - 1.18L'])
  })

  // A failed call of the grader that reads the card question is no evidence of the build: the attempt is unavailable, the
  // person answers nothing, and no preview is approved.
  it('gives a failed read of the card question an unavailable attempt, sends no answer and approves nothing', async () => {
    const [{ block }] = answered[0].parts
    const failedCall = 'Claude grading failed: process exited with code 1.'
    vi.mocked(askGrader).mockResolvedValueOnce({ error: failedCall })
    const { verdict, sent, fixture } = await attempt('same-title-card-en', { replies: [answered[0]], held: [], habits: sameTitleHabits, records: sameTitleRecords })
    expect(sent).toHaveLength(1)
    expect(verdict).toMatchObject({ pass: false, metadata: { unavailable: true },
      reason: `The grader call that reads the card question failed (${failedCall}): ${block.questions[0].prompt}` })
    expect(fixture.calls.map((call) => call.path.split('/').at(-1))).not.toContain('confirm')
  })

  it('passes the same split in pt-BR, where the answer of the person is its own text', async () => {
    const { verdict, sent } = await attempt('same-title-card-pt', { replies: answered, habits: sameTitleHabits, records: sameTitleRecords })
    expect(verdict.pass, verdict.reason).toBe(true)
    expect(sent[1].blockAnswer).toMatchObject({ answers: [{ questionId: 'records', selectedIds: [children[4], children[5]] }] })
  })

  it('fails a split that asks a question where the case allows none', async () => {
    const { verdict } = await attempt('same-title-split-en', { replies: answered, habits: sameTitleHabits, records: sameTitleRecords })
    expect(verdict).toMatchObject({ pass: false, reason: 'The assistant asked 1 time(s) before a preview; the request allows 0.' })
  })

  it('passes a deletion of the last two by order and fails one more record in the preview', async () => {
    const two = deletes.filter((item) => [children[4], children[5]].includes(item.entityId))
    const ok = await attempt('same-title-subset-en', { replies: [withPreview(combined(two))], habits: sameTitleHabits, records: sameTitleRecords })
    expect(ok.verdict.pass, ok.verdict.reason).toBe(true)
    expect(ok.fixture.state.map((habit) => habit.id)).toEqual([parent, ...children.slice(0, 4)])
    const third = itemOf(children[0], 'Water - 710ml', { delete: [null, null, 'action'] })
    const extra = await attempt('same-title-subset-en', { replies: [withPreview(combined([...two, third]))], habits: sameTitleHabits, records: sameTitleRecords })
    expect(extra.verdict).toMatchObject({ pass: false, reason: 'The preview holds a change outside the request. The request needs delete; the preview holds delete 3.' })
  })

  it('fails a rename to another title, and a preview that holds the rename and loses the deletion', async () => {
    const wrong = renames.map((item) => itemOf(item.entityId, item.entityName, { title: [item.entityName, 'Water - 1L'] }))
    const other = await attempt('same-title-whole-en', { replies: [withPreview(combined(wrong))], habits: sameTitleHabits, records: sameTitleRecords })
    expect(other.verdict.pass).toBe(false)
    const lost = await attempt('same-title-card-pt', { replies: [answered[0], withPreview(combined(renames))], habits: sameTitleHabits, records: sameTitleRecords })
    expect(lost.verdict).toMatchObject({ pass: false, reason: expect.stringContaining('The preview does not delete exactly the records of the request.') })
  })

  it('fails a preview of the real run 5 that held the renames and lost the deletion', async () => {
    const run5 = streams.run5
    const children5 = run5.children
    const habits = [storedHabit(parent, 'Water'), ...children5.map((id) => storedHabit(id, 'Water - 710ml'))]
    const { verdict } = await attempt('same-title-split-pt', { replies: [turnOf({ pendingOperations: run5.answer.pendingOperations })], habits,
      records: { parent, children: children5 } })
    expect(verdict.pass).toBe(false)
    expect(verdict.reason).toContain('The preview does not delete exactly the records of the request.')
  })

  it('asks once for a singular request, answers with the third child and previews that one rename', async () => {
    const card = { ...answered[0], parts: [{ type: 'block', kind: 'choice', block: { blockId: '99999999-0000-4000-8000-000000000001', question: 'Which one?',
      options: children.map((id, index) => ({ id, label: `Water - 710ml ${index + 1}` })), multiSelect: false, allowFreeText: false, expiresAtUtc: '2026-11-14T00:00:00Z' } }] }
    const held = [previewOf('updateHabits', [itemOf(children[2], 'Water - 710ml', { title: ['Water - 710ml', 'Water - 1.18L'] })])]
    const { verdict, sent, fixture } = await attempt('same-title-singular-en', { replies: [card, turnOf({ pendingOperations: held })], habits: sameTitleHabits, records: sameTitleRecords })
    expect(sent[1].blockAnswer).toMatchObject({ blockId: '99999999-0000-4000-8000-000000000001', selectedIds: [children[2]] })
    expect(verdict.pass, verdict.reason).toBe(true)
    expect(fixture.state.map((habit) => habit.title)).toEqual(['Water', 'Water - 710ml', 'Water - 710ml', 'Water - 1.18L', 'Water - 710ml', 'Water - 710ml', 'Water - 710ml'])
  })

  it('fails a singular request that renames every child without asking', async () => {
    const all = combined(renames)
    const { verdict } = await attempt('same-title-control-thanks-en', { replies: [withPreview(all)], habits: sameTitleHabits, records: sameTitleRecords })
    expect(verdict.pass).toBe(false)
  })
})

// Producer: PendingOperationChangePreviewer.AddProposedFields. A write that names a field the habit already holds shows a row
// whose old and new value are the proposed value, and the restart keeps such a habit where it is.
const restartIds = Array.from({ length: 6 }, (_, index) => `11111111-1111-4111-8111-11111111111${index}`)
// Producer: fixtures/restart.mjs seedRestart logs each habit once, on the sixth day before the account date.
const pastLog = { date: addDays(-6), value: 1, note: null, createdAtUtc: '2026-11-07T08:00:00Z' }
const restartHabits = restartIds.map((id, index) => storedHabit(id, `Habit ${index}`, { dueDate: index < 4 ? addDays(-2) : accountDate, logs: [pastLog] }))
const logHistoryChanges = {
  'removes the past log of every habit': (habits) => habits.forEach((habit) => { habit.logs = [] }),
  'removes the past log of one habit': (habits) => { habits[5].logs = [] },
  'adds a past log to one habit': (habits) => habits[2].logs.push({ ...pastLog, date: addDays(-3) }),
  'changes the value of a past log': (habits) => { habits[0].logs[0].value = 2 },
  'changes the note of a past log': (habits) => { habits[4].logs[0].note = 'Edited' },
}
const restartDecisions = ['composition-restart-approve-en', 'composition-restart-reject-en']
const restartPreview = (dates, extra = {}) => [previewOf('rescheduleHabits', restartIds.map((id, index) => itemOf(id, `Habit ${index}`,
  { due_date: [restartHabits[index].dueDate, dates[index], 'date'], ...(extra[index] ?? {}) })))]
const todayCount = (todays) => restartIds.map((_, index) => index >= 6 - todays ? accountDate : addDays(1))
const heldRestart = (id, dates, options = {}) => {
  const held = restartPreview(dates, options.extra)
  return attempt(id, { replies: [turnOf({ pendingOperations: held })], habits: restartHabits, records: { habits: restartIds }, ...options })
}

describe('a restart case', () => {
  it('previews a smaller set today, with the habits that stay due today kept where they are', async () => {
    const { verdict } = await heldRestart('composition-restart-preview-en', todayCount(3))
    expect(verdict).toMatchObject({ pass: true, reason: 'The held previews hold exactly the requested changes.' })
  })

  it('approves the preview and reads the saved dates back', async () => {
    const { verdict, fixture } = await heldRestart('composition-restart-approve-en', todayCount(3))
    expect(verdict.pass, verdict.reason).toBe(true)
    expect(fixture.state.map((habit) => habit.dueDate)).toEqual([addDays(1), addDays(1), addDays(1), accountDate, accountDate, accountDate])
  })

  it.each([
    ['every habit today', todayCount(6), 'leaves 6 of 6 due today'],
    ['no habit today', restartIds.map(() => addDays(1)), 'leaves 0 of 6 due today'],
    ['a date beyond the window', [...todayCount(3).slice(0, 5), addDays(9)], 'gives due_date the value'],
    ['a past date', [addDays(-1), ...todayCount(3).slice(1)], 'gives due_date the value'],
  ])('fails %s', async (_name, dates, reason) => {
    const { verdict } = await heldRestart('composition-restart-preview-en', dates)
    expect(verdict.pass).toBe(false)
    expect(verdict.reason).toContain(reason)
  })

  it('fails a preview that leaves one habit out and a preview that changes more than the date', async () => {
    const partial = restartPreview(todayCount(3))
    partial[0].items.pop()
    const missing = await attempt('composition-restart-preview-en', { replies: [turnOf({ pendingOperations: partial })], habits: restartHabits, records: { habits: restartIds } })
    expect(missing.verdict.reason).toContain('The preview does not update exactly the records of the request.')
    const more = await heldRestart('composition-restart-preview-en', todayCount(3), { extra: { 0: { title: ['Habit 0', 'Changed'] } } })
    expect(more.verdict.reason).toContain('changes due_date, title where the request changes due_date')
  })

  it('keeps the count of habits today that the person asks for', async () => {
    expect((await heldRestart('composition-restart-preference-en', todayCount(2))).verdict.pass).toBe(true)
    const three = await heldRestart('composition-restart-preference-en', todayCount(3))
    expect(three.verdict).toMatchObject({ pass: false, reason: expect.stringContaining('leaves 3 of 6 due today, and the request needs 2') })
  })

  it('rejects the preview: the server refuses to confirm it and the account is as it was', async () => {
    const { verdict, fixture } = await heldRestart('composition-restart-reject-en', todayCount(3))
    expect(verdict).toMatchObject({ pass: true, reason: 'The saved state matches the approved changes.' })
    expect(fixture.calls.map((call) => call.path.split('/').at(-1))).toContain('revise')
    expect(fixture.state.map((habit) => habit.dueDate)).toEqual(restartHabits.map((habit) => habit.dueDate))
  })

  it('fails a rejection that the server still lets the person confirm', async () => {
    const { verdict } = await heldRestart('composition-restart-reject-en', todayCount(3), { confirmsAfterRevise: true })
    expect(verdict).toMatchObject({ pass: false, reason: expect.stringContaining('A rejected preview remains confirmable.') })
  })

  it('fails a rejection that the server saved anyway', async () => {
    const { verdict, fixture } = await heldRestart('composition-restart-reject-en', todayCount(3), { savesOnRevise: true })
    expect(fixture.state.map((habit) => habit.dueDate)).not.toEqual(restartHabits.map((habit) => habit.dueDate))
    expect(verdict).toMatchObject({ pass: false, reason: expect.stringContaining('due_date') })
  })

  it.each(['composition-restart-approve-en', 'composition-restart-reject-en'])('fails %s when the account held the dates before the decision', async (id) => {
    const moved = restartHabits.map((habit, index) => ({ ...habit, dueDate: todayCount(3)[index] }))
    const { verdict } = await heldRestart(id, todayCount(3), { accountHabits: moved })
    expect(verdict).toMatchObject({ pass: false, reason: 'The held preview changed the account before its approval.' })
  })

  it('runs the same case in pt-BR over the same preview', async () => {
    expect((await heldRestart('composition-restart-approve-pt-BR', todayCount(3))).verdict.pass).toBe(true)
  })

  // The restart keeps the past log history of each habit: the approval moves dates, and the rejection moves nothing.
  describe.each(restartDecisions)('%s and the past log history', (id) => {
    it.each(Object.entries(logHistoryChanges))('fails a decision that %s', async (_name, change) => {
      const { verdict } = await heldRestart(id, todayCount(3), { afterDecision: change })
      expect(verdict.pass).toBe(false)
      expect(verdict.reason).toMatch(/^The (approved|rejected) preview changed the past log history of Habit \d\.$/u)
    })

    it.each(Object.entries(logHistoryChanges))('fails a held preview that %s before the decision', async (_name, change) => {
      const moved = structuredClone(restartHabits)
      change(moved)
      const { verdict } = await heldRestart(id, todayCount(3), { accountHabits: moved })
      expect(verdict).toMatchObject({ pass: false, reason: 'The held preview changed the account before its approval.' })
    })

    it('passes a decision that leaves each past log as it was', async () => {
      expect((await heldRestart(id, todayCount(3))).verdict.pass).toBe(true)
    })
  })

  // The account approves the preview as shown. A write that saves another value than the one the person saw is no approval of it.
  it.each([
    ['a date five days on where the preview showed one', (index) => ({ due_date: [restartHabits[index].dueDate, addDays(5), 'date'] }), `saves due_date as "${addDays(5)}"`],
    ['today where the preview showed tomorrow', (index) => ({ due_date: [restartHabits[index].dueDate, accountDate, 'date'] }), `saves due_date as "${accountDate}"`],
  ])('fails an approval that saves %s', async (_name, saved, reason) => {
    const shown = restartPreview(todayCount(3))
    const saves = restartPreview(todayCount(3)).map((preview) => ({ ...preview, items: preview.items.map((item, index) => index < 3 ? itemOf(item.entityId, item.entityName, saved(index)) : item) }))
    const { verdict } = await attempt('composition-restart-approve-en', { replies: [turnOf({ pendingOperations: shown })], held: saves, habits: restartHabits, records: { habits: restartIds } })
    expect(verdict).toMatchObject({ pass: false, reason: expect.stringContaining(reason) })
  })
})

// The rows that each restart case states: the window of the new date, the count of habits due today, and the decision.
describe.each(['preview', 'approve', 'reject', 'preference'].flatMap((family) => ['en', 'pt-BR'].map((locale) => [`composition-restart-${family}-${locale}`, family])))('the rows of %s', (id, family) => {
  const keeps = family === 'preference' ? 2 : 3
  const wrongCounts = family === 'preference' ? [1, 3] : [0, 6]

  it('passes the preview that holds every row, and does what the decision of the case says', async () => {
    const { verdict, fixture } = await heldRestart(id, todayCount(keeps))
    const paths = fixture.calls.map((call) => call.path.split('/').at(-1))
    if (family === 'approve') {
      expect(verdict).toMatchObject({ pass: true, reason: 'The saved state matches the approved changes.' })
      expect(paths).toEqual(['snapshot', 'confirm', 'execute', 'snapshot'])
      expect(fixture.state.map((habit) => habit.dueDate)).toEqual(todayCount(keeps))
    } else if (family === 'reject') {
      expect(verdict).toMatchObject({ pass: true, reason: 'The saved state matches the approved changes.' })
      expect(paths).toContain('revise')
      expect(fixture.state.map((habit) => habit.dueDate)).toEqual(restartHabits.map((habit) => habit.dueDate))
    } else {
      expect(verdict).toMatchObject({ pass: true, reason: 'The held previews hold exactly the requested changes.' })
      expect(paths).toEqual([])
    }
  })

  it('states the window and the count, and the decision that the family needs', () => {
    const { outcome } = caseOf(id).vars
    expect(Object.keys(outcome.changes[0].fields)).toEqual(['due_date'])
    expect(outcome.changes[0].fields.due_date).toEqual({ withinDays: [0, 7], mayStay: true })
    expect(outcome.changes[0].dueToday).toEqual(family === 'preference' ? 2 : { min: 1, max: 5 })
    expect(outcome.decision).toBe({ approve: 'approve', reject: 'reject' }[family])
  })

  it('holds the answer to its preview alone', () => {
    expect(caseOf(id).vars.composition).toEqual({ mode: 'preview', previews: 1, previewOnly: true })
  })

  it.each([
    ['a block', { parts: [{ type: 'block', kind: 'habitList', block: { scope: 'today', items: [{ id: 'water', title: 'Water', emoji: null, depth: 0, isBadHabit: false, status: 'today' }], totalCount: 1 } }] }],
    ['a follow-up', { followUps: ['Anything else?'] }],
    ['an action', { actions: [{ type: 'CreateHabit', status: 'Success' }] }],
    ['a policy denial', { policyDenials: [{ operationId: 'create_habit', reason: 'Not allowed.' }] }],
    ['a failed operation', { operations: [{ operationId: 'create_habit', status: 'Failed' }] }],
  ])('fails %s beside the preview, and passes it once previewOnly is removed', async (_name, beside) => {
    const held = restartPreview(todayCount(keeps))
    const { vars, response } = await attempt(id, { replies: [turnOf({ pendingOperations: held, ...beside })], habits: restartHabits, records: { habits: restartIds } })
    expect(await composition(response.output, { vars })).toMatchObject({ pass: false, reason: 'A preview case allows only the preview and its note.' })
    const open = structuredClone(vars)
    delete open.composition.previewOnly
    expect((await composition(response.output, { vars: open })).pass, 'without previewOnly').toBe(true)
  })

  it.each([
    ['a date beyond the window', [...todayCount(keeps).slice(0, 5), addDays(9)]],
    ['a past date', [addDays(-1), ...todayCount(keeps).slice(1)]],
  ])('fails %s', async (_name, dates) => {
    expect((await heldRestart(id, dates)).verdict).toMatchObject({ pass: false, reason: expect.stringContaining('gives due_date the value') })
  })

  it.each(wrongCounts)('fails %i habits due today, and passes them once the count is removed', async (count) => {
    const { verdict } = await heldRestart(id, todayCount(count))
    expect(verdict).toMatchObject({ pass: false, reason: expect.stringContaining(`leaves ${count} of 6 due today`) })
    const stripped = structuredClone(caseOf(id).vars.outcome)
    delete stripped.changes[0].dueToday
    expect((await heldRestart(id, todayCount(count), { outcome: stripped })).verdict.pass, 'without dueToday').toBe(true)
  })
})

// Producer: PendingOperationChangePreviewer.BindReuseFieldsAsync gives a create that reuses a stored habit the record of that
// habit and each of its stored values, and PreserveReuseParent adds the parent row that changes nothing.
const water = '22222222-2222-4222-8222-222222222222'
const brainHabits = [storedHabit(water, 'Water')]
const rootParent = { parent_habit_id: [null, 'No parent'] }
const dentist = itemOf(null, 'Call the dentist', { ...rootParent, title: [null, 'Call the dentist'], frequency_unit: [null, 'OneTime'], due_date: [null, addDays(1), 'date'] })
const stretch = itemOf(null, 'Stretch', { ...rootParent, title: [null, 'Stretch'], frequency_unit: [null, 'Day'], frequency_quantity: [null, '1', 'number'],
  due_date: [null, accountDate, 'date'], due_time: [null, '08:00', 'time'] })
const reused = itemOf(water, 'Water', { frequency_unit: ['Day', 'Day'], parent_habit_id: ['No parent', 'No parent'] })
const idea = itemOf(null, 'Read', { ...rootParent, title: [null, 'Read'], frequency_unit: [null, 'Day'], frequency_quantity: [null, '1', 'number'], due_date: [null, accountDate, 'date'] })
const brainDump = (id, items, options = {}) => attempt(id, { replies: [turnOf({ pendingOperations: [previewOf('createHabits', items)] })], habits: brainHabits,
  records: { first: water, water, second: water, walk: water }, ...options })

describe('a brain dump case', () => {
  it('previews the task for tomorrow and the daily habit at eight, approves them and reads both saved records back', async () => {
    const { verdict, fixture } = await brainDump('brain-dump-mixed-en', [dentist, stretch])
    expect(verdict).toMatchObject({ pass: true, reason: 'The saved state matches the approved changes.' })
    expect(fixture.state.map((habit) => habit.title)).toEqual(['Water', 'Call the dentist', 'Stretch'])
  })

  it.each([
    ['an unrequested third item', [dentist, stretch, idea], 'The preview holds a change outside the request.'],
    ['the habit at another time', [dentist, itemOf(null, 'Stretch', { ...rootParent, title: [null, 'Stretch'], frequency_unit: [null, 'Day'], frequency_quantity: [null, '1'], due_date: [null, accountDate], due_time: [null, '09:00'] })], 'The preview does not create exactly the records of the request.'],
    ['the task as a daily habit', [itemOf(null, 'Call the dentist', { ...rootParent, title: [null, 'Call the dentist'], frequency_unit: [null, 'Day'], due_date: [null, addDays(1)] }), stretch], 'The preview does not create exactly the records of the request.'],
    ['the task today', [itemOf(null, 'Call the dentist', { ...rootParent, title: [null, 'Call the dentist'], frequency_unit: [null, 'OneTime'], due_date: [null, accountDate] }), stretch], 'The preview does not create exactly the records of the request.'],
  ])('fails %s', async (_name, items, reason) => {
    const { verdict } = await brainDump('brain-dump-mixed-en', items)
    expect(verdict.pass).toBe(false)
    expect(verdict.reason).toContain(reason)
  })

  it('reuses the stored habit of the person: it is a change of the list, never a second record', async () => {
    const { verdict, fixture } = await brainDump('brain-dump-reuse-en', [dentist, stretch, reused])
    expect(verdict.pass, verdict.reason).toBe(true)
    expect(fixture.state).toHaveLength(3)
    const lost = await brainDump('brain-dump-reuse-en', [dentist, stretch])
    expect(lost.verdict).toMatchObject({ pass: false, reason: expect.stringContaining('The preview does not reuse exactly the records of the request.') })
    const duplicate = await brainDump('brain-dump-reuse-en', [dentist, stretch, itemOf(null, 'Water', { ...rootParent, title: [null, 'Water'], frequency_unit: [null, 'Day'] })])
    expect(duplicate.verdict.pass).toBe(false)
  })

  it('adds one idea of the assistant to the same preview', async () => {
    expect((await brainDump('brain-dump-ideas-en', [dentist, stretch, idea])).verdict.pass).toBe(true)
    const without = await brainDump('brain-dump-ideas-en', [dentist, stretch])
    expect(without.verdict).toMatchObject({ pass: false, reason: expect.stringContaining('The preview does not create exactly the records of the request.') })
  })

  it.each([
    ['brain-dump-ideas-en', [dentist, stretch], 'Read', 'Day'],
    ['brain-dump-ideas-pt-BR', [itemOf(null, 'Ligar para o dentista', { ...rootParent, title: [null, 'Ligar para o dentista'], frequency_unit: [null, 'OneTime'], due_date: [null, addDays(1)] }),
      itemOf(null, 'Alongar', { ...rootParent, title: [null, 'Alongar'], frequency_unit: [null, 'Day'], frequency_quantity: [null, '1'], due_date: [null, accountDate], due_time: [null, '08:00'] })], 'Ler', 'Day'],
  ])('holds the idea of %s to a daily habit', async (id, requested, title, unit) => {
    const third = (frequency) => itemOf(null, title, { ...rootParent, title: [null, title], frequency_unit: [null, frequency], due_date: [null, accountDate] })
    expect((await brainDump(id, [...requested, third(unit)])).verdict.pass).toBe(true)
    for (const other of ['OneTime', 'Week']) {
      const { verdict } = await brainDump(id, [...requested, third(other)])
      expect(verdict.pass, other).toBe(false)
    }
  })
})

// The rows that each brain dump case states, and for each row an item of the preview that breaks that row alone. The preview
// shows the parent of a create as the parent_habit_id row (the parent title, or No parent), and the eval/snapshot row holds no
// parent, so the preview grade holds it.
const dentista = itemOf(null, 'Ligar para o dentista', { ...rootParent, title: [null, 'Ligar para o dentista'], frequency_unit: [null, 'OneTime'], due_date: [null, addDays(1)] })
const alongar = itemOf(null, 'Alongar', { ...rootParent, title: [null, 'Alongar'], frequency_unit: [null, 'Day'], frequency_quantity: [null, '1'], due_date: [null, accountDate], due_time: [null, '08:00'] })
const withRow = (item, field, value) => ({ ...item, fields: item.fields.map((row) => row.field === field ? { ...row, newValue: value, proposedValue: value } : row) })
const filedUnder = (item) => ({ ...item, fields: item.fields.map((row) => row.field === 'parent_habit_id' ? { ...row, newValue: 'Water', proposedValue: water } : row) })
const editing = (change) => (items, at) => items.map((item, index) => index === at ? change(item) : item)
const rowViolations = {
  task: { parent_habit_id: editing(filedUnder), title: editing((item) => withRow(item, 'title', 'Pay the rent')),
    frequency_unit: editing((item) => withRow(item, 'frequency_unit', 'Day')), due_date: editing((item) => withRow(item, 'due_date', accountDate)) },
  habit: { parent_habit_id: editing(filedUnder), title: editing((item) => withRow(item, 'title', 'Pay the rent')),
    frequency_unit: editing((item) => withRow(item, 'frequency_unit', 'Week')), frequency_quantity: editing((item) => withRow(item, 'frequency_quantity', '2')),
    due_date: editing((item) => withRow(item, 'due_date', addDays(1))), due_time: editing((item) => withRow(item, 'due_time', '09:00')) },
  idea: { parent_habit_id: editing(filedUnder), frequency_unit: editing((item) => withRow(item, 'frequency_unit', 'Week')) },
  reuse: { record: (items, at) => items.filter((_, index) => index !== at) },
}
const dumpItems = { en: { task: dentist, habit: stretch, reuse: reused, idea }, 'pt-BR': { task: dentista, habit: alongar, reuse: reused, idea } }
const withoutRow = (id, at, field) => {
  const { outcome } = structuredClone(caseOf(id).vars)
  if (field === 'record') outcome.changes.splice(at, 1)
  else delete outcome.changes[at].fields[field]
  return outcome
}

describe.each([
  ['brain-dump-mixed-en', 'en', ['task', 'habit']],
  ['brain-dump-mixed-pt-BR', 'pt-BR', ['task', 'habit']],
  ['brain-dump-reuse-en', 'en', ['task', 'habit', 'reuse']],
  ['brain-dump-reuse-pt-BR', 'pt-BR', ['task', 'habit', 'reuse']],
  ['brain-dump-ideas-en', 'en', ['task', 'habit', 'idea']],
  ['brain-dump-ideas-pt-BR', 'pt-BR', ['task', 'habit', 'idea']],
])('the rows of %s', (id, locale, roles) => {
  const items = roles.map((role) => dumpItems[locale][role])

  it('states one row for each field of each create that the table breaks, and the reuse of the stored habit', () => {
    const { changes } = caseOf(id).vars.outcome
    expect(changes.map((change) => change.kind)).toEqual(roles.map((role) => role === 'reuse' ? 'reuse' : 'create'))
    roles.forEach((role, at) => expect(Object.keys(changes[at].fields ?? {}).toSorted(), `change ${at}`)
      .toEqual(role === 'reuse' ? [] : Object.keys(rowViolations[role]).toSorted()))
  })

  it('holds the answer to its preview and one plain sentence of note', () => {
    expect(caseOf(id).vars.composition).toEqual({ mode: 'preview', previewNote: 'plain', previewOnly: true })
  })

  it('passes the preview that holds every row, approves it and reads the saved records back', async () => {
    const { verdict } = await brainDump(id, items)
    expect(verdict).toMatchObject({ pass: true, reason: 'The saved state matches the approved changes.' })
  })

  it.each(roles.flatMap((role, at) => Object.entries(rowViolations[role]).map(([field, violate]) => [`${role} ${at}`, at, field, violate])))(
    'fails the preview that breaks the row of %s %s, and passes it once that row is removed', async (_role, at, field, violate) => {
      const broken = violate(items, at)
      expect((await brainDump(id, broken)).verdict.pass, `${field} of change ${at}`).toBe(false)
      expect((await brainDump(id, broken, { outcome: withoutRow(id, at, field) })).verdict.pass, `without ${field}`).toBe(true)
    })
})

// Producer: the records card that orbit-api CompleteRecordCard sends over more than four records (a choice holds four options
// at most, AskTool.cs): one question block with one singleChoice `records` question, one option per record in read order, its
// id the record id.
const recordsQuestion = (offered, id = 'records') => ({ id, type: 'singleChoice', prompt: 'Which Water - 710ml habit do you want to rename?',
  allowFreeText: false, options: offered.map((record) => ({ id: record, label: `Water - 710ml (${children.indexOf(record) + 1} of ${children.length})` })) })
const recordsCard = (...questions) => turnOf({ parts: [{ type: 'block', kind: 'question', block: { blockId: '99999999-9999-4999-8999-999999999999',
  expiresAtUtc: '2026-11-14T04:33:04Z', questions } }] })
const thirdRename = turnOf({ pendingOperations: [previewOf('updateHabits', [itemOf(children[2], 'Water - 710ml', { title: ['Water - 710ml', 'Water - 1.18L'] })])] })
const singularCases = ['singular', 'control-thanks', 'control-order'].flatMap((name) => ['en', 'pt'].map((suffix) => `same-title-${name}-${suffix}`))
const withoutSeparate = (id) => {
  const { answer } = structuredClone(caseOf(id).vars)
  delete answer.separate
  return answer
}
const singular = (id, card, extra = {}) => attempt(id, { replies: [card, thirdRename], habits: sameTitleHabits, records: sameTitleRecords, ...extra })

describe('the card of a singular same-title request', () => {
  it.each(singularCases)('asks %s for each of the six children as its own option', (id) => {
    expect(caseOf(id).vars.answer).toMatchObject({ pick: { of: 'children', position: 2 }, separate: 'children' })
  })

  it.each(singularCases)('passes %s when the card offers each of the six children as a separate option', async (id) => {
    const { verdict, sent } = await singular(id, recordsCard(recordsQuestion(children)))
    expect(verdict.pass, verdict.reason).toBe(true)
    expect(sent[1].blockAnswer).toMatchObject({ answers: [{ questionId: 'records', selectedIds: [children[2]] }] })
  })

  it.each(singularCases.flatMap((id) => [
    [id, 'four of the six', children.slice(0, 4), 4],
    [id, 'five of the six, without the picked one', children.filter((_, index) => index !== 2), 5],
    [id, 'five of the six, with the picked one', children.filter((_, index) => index !== 5), 5],
  ]))('fails %s for a card that offers %s, sends no answer, and passes once the case states no separate options', async (id, _name, offered, count) => {
    const { verdict, sent } = await singular(id, recordsCard(recordsQuestion(offered)))
    expect(verdict).toMatchObject({ pass: false, reason: `The card offers ${count} of the 6 same-title children as separate options.` })
    expect(sent).toHaveLength(1)
    if (!offered.includes(children[2])) {
      expect((await singular(id, recordsCard(recordsQuestion(offered)), { answer: withoutSeparate(id) })).verdict.pass, 'without separate').toBe(true)
    }
  })

  it.each(singularCases)('fails %s for a card with no option that stands for the picked record, never by typing the answer', async (id) => {
    const card = recordsCard(recordsQuestion(children), recordsQuestion(children, 'second'))
    const { verdict, sent } = await singular(id, card)
    expect(verdict).toMatchObject({ pass: false, reason: 'The card has no option that stands for the picked record.' })
    expect(sent).toHaveLength(1)
    expect((await singular(id, card, { answer: withoutSeparate(id) })).verdict.pass, 'without separate').toBe(true)
  })
})

// Two checks of the brain dump preview that no row of an expected create carries: two creates that share a title, and a
// stored habit that the preview reuses and the request does not name.
const sameTitleIdea = (title) => itemOf(null, title, { ...rootParent, title: [null, title], frequency_unit: [null, 'Day'], frequency_quantity: [null, '1', 'number'],
  due_date: [null, accountDate, 'date'] })
const withoutKey = (id, key) => {
  const stripped = structuredClone(caseOf(id).vars.outcome)
  delete stripped[key]
  return stripped
}

describe('the brain dump previews that repeat or reuse a record', () => {
  it.each([['brain-dump-ideas-en', 'en', 'Stretch'], ['brain-dump-ideas-pt-BR', 'pt-BR', 'Alongar']])(
    'fails %s for an idea that repeats the title of a requested habit, and passes once the case states no distinct titles', async (id, locale, title) => {
      const repeated = [dumpItems[locale].task, dumpItems[locale].habit, sameTitleIdea(title.toLowerCase())]
      const { verdict } = await brainDump(id, repeated)
      expect(verdict).toMatchObject({ pass: false, reason: 'Two created records of the preview share a title.' })
      expect((await brainDump(id, repeated, { outcome: withoutKey(id, 'distinctTitles') })).verdict.pass, 'without distinctTitles').toBe(true)
    })

  it.each([['brain-dump-mixed-en', 'en'], ['brain-dump-mixed-pt-BR', 'pt-BR'], ['brain-dump-ideas-en', 'en'], ['brain-dump-ideas-pt-BR', 'pt-BR']])(
    'fails %s for a stored habit that the request does not name, and passes once the case states no reuses', async (id, locale) => {
      const items = id.includes('ideas') ? [dumpItems[locale].task, dumpItems[locale].habit, dumpItems[locale].idea] : [dumpItems[locale].task, dumpItems[locale].habit]
      const { verdict } = await brainDump(id, [...items, reused])
      expect(verdict).toMatchObject({ pass: false, reason: expect.stringContaining('The preview holds a change outside the request.') })
      expect((await brainDump(id, [...items, reused], { outcome: withoutKey(id, 'reuses') })).verdict.pass, 'without reuses').toBe(true)
    })
})

// The question turn of a case that asks first is not the turn that holds the preview, so the grade of its layout reads the
// question turns that the conversation recorded. The eight cases that state `allowQuestion` are the cases that ask.
const askingCases = corpus.filter((entry) => entry.vars.composition?.allowQuestion === true).map((entry) => entry.metadata.id)
const asksWithCard = (id) => id.includes('-card-')
const questionTurn = (id) => asksWithCard(id) ? answered[0] : recordsCard(recordsQuestion(children))
const previewTurn = (id) => asksWithCard(id) ? answered[1] : thirdRename
const habitListPart = { type: 'block', kind: 'habitList', block: { scope: 'today', totalCount: 1,
  items: [{ id: 'water', title: 'Water', emoji: null, depth: 0, isBadHabit: false, status: 'today' }] } }
const besideTheCard = [
  ['a second block', (turn) => ({ ...turn, parts: [...turn.parts, habitListPart] })],
  ['two lines of prose', (turn) => ({ ...turn, aiMessage: 'First line.\nSecond line.', parts: [{ type: 'text', text: 'First line.\nSecond line.' }, ...turn.parts] })],
]

describe('the question turn of a case that asks first', () => {
  it('is each of the eight same-title cases that ask, in both locales', () => {
    expect(askingCases).toHaveLength(8)
    expect(askingCases.every((id) => lifecycle.some((entry) => entry.metadata.id === id))).toBe(true)
  })

  it.each(askingCases)('passes %s when its question is one card', async (id) => {
    const { vars, response } = await attempt(id, { replies: [questionTurn(id), previewTurn(id)], habits: sameTitleHabits, records: sameTitleRecords })
    expect(await composition(response.output, { vars })).toMatchObject({ pass: true })
  })

  it.each(askingCases.flatMap((id) => besideTheCard.map(([name, change]) => [id, name, change])))(
    'fails %s for a question turn with %s beside the card, and passes once the case allows no question', async (id, _name, change) => {
      const { vars, response } = await attempt(id, { replies: [change(questionTurn(id)), previewTurn(id)], habits: sameTitleHabits, records: sameTitleRecords })
      expect(await composition(response.output, { vars })).toMatchObject({ pass: false,
        reason: 'The question before the preview: A question before the preview must be one choice or question card, or one to three short lines.' })
      const silent = structuredClone(vars)
      delete silent.composition.allowQuestion
      expect((await composition(response.output, { vars: silent })).pass, 'without allowQuestion').toBe(true)
    })
})

// The carriers of the checks of the deleted lifecycle modules that no row of a case names: the account that the held preview
// changed before the approval, the failed gate that stops the approval, and the conversation that the approval runs in. Each
// row drives the real case through the provider path.
const restartTurn = (todays) => ({ replies: [turnOf({ pendingOperations: restartPreview(todayCount(todays)) })], habits: restartHabits, records: { habits: restartIds } })
const heldChangedAccount = {
  'composition-restart-approve-en': { ...restartTurn(3), accountHabits: restartHabits.map((habit, index) => index === 0 ? { ...habit, title: 'Changed before approval' } : habit) },
  'same-title-card-en': { replies: answered, habits: sameTitleHabits, records: sameTitleRecords,
    accountHabits: sameTitleHabits.map((habit, index) => index === 2 ? { ...habit, title: 'Water - 1.18L' } : habit) },
  'brain-dump-mixed-en': { replies: [turnOf({ pendingOperations: [previewOf('createHabits', [dentist, stretch])] })], habits: brainHabits,
    records: { water }, accountHabits: [...brainHabits, storedHabit('44444444-4444-4444-8444-444444444444', 'Call the dentist')] },
}
const failedGate = {
  'composition-restart-approve-en': restartTurn(6),
  'composition-restart-reject-en': restartTurn(0),
  'same-title-whole-en': { replies: [withPreview(combined(renames.map((item) => itemOf(item.entityId, item.entityName, { title: [item.entityName, 'Water - 1L'] }))))],
    habits: sameTitleHabits, records: sameTitleRecords },
  'brain-dump-mixed-en': { replies: [turnOf({ pendingOperations: [previewOf('createHabits', [dentist])] })], habits: brainHabits, records: { water } },
}
const approvedPaths = (fixture) => fixture.calls.map((call) => call.path.split('/').at(-1)).filter((path) => ['confirm', 'execute'].includes(path))

describe('the carriers of the deleted checks of the lifecycle modules', () => {
  it.each(Object.entries(heldChangedAccount))('fails %s when the held preview changed the account, and approves nothing', async (id, setup) => {
    const { verdict, fixture } = await attempt(id, setup)
    expect(verdict).toMatchObject({ pass: false, reason: 'The held preview changed the account before its approval.' })
    expect(approvedPaths(fixture)).toEqual([])
  })

  it.each(Object.entries(failedGate))('stops %s at its failed preview grade before any approval', async (id, setup) => {
    const { verdict, fixture } = await attempt(id, setup)
    expect(verdict.pass).toBe(false)
    expect(verdict.reason).not.toBe('The saved state matches the approved changes.')
    expect(approvedPaths(fixture)).toEqual([])
  })

  const withConversationIds = (replies) => replies.map((reply, at) => ({ ...reply, conversationId: `cccccccc-cccc-4ccc-8ccc-${String(at + 1).padStart(12, '0')}` }))
  it.each([['same-title-card-en', { replies: withConversationIds(answered), habits: sameTitleHabits, records: sameTitleRecords }],
    ['brain-dump-mixed-en', { replies: withConversationIds([turnOf({ pendingOperations: [previewOf('createHabits', [dentist, stretch])] })]), habits: brainHabits, records: { water } }],
  ])('approves %s under the conversation id that its last response set', async (id, setup) => {
    const { fixture, conversationIds } = await attempt(id, setup)
    const execute = fixture.calls.find((call) => call.path.endsWith('/execute'))
    expect(conversationIds[0]).not.toBe(setup.replies.at(-1).conversationId)
    expect(execute.body.clientContext.conversationId).toBe(setup.replies.at(-1).conversationId)
  })
})

// The failure rows of the deleted tests of the restart, brain dump and approval modules that the outcome grade keeps. Each row
// drives the real case through the provider path, with the preview or the server defect that the deleted row built.
const brainDumpMixed = (options) => brainDump('brain-dump-mixed-en', [dentist, stretch], options)
const confirmFails = () => { throw Object.assign(new Error('Fixture API POST ai/pending-operations/{id}/confirm failed: HTTP 503 (errorCode: none).'), { status: 503 }) }
const confirmWithoutToken = (id) => ({ status: 200, payload: { pendingOperationId: id } })
const confirmForAnother = () => ({ status: 200, payload: { pendingOperationId: '99999999-9999-4999-8999-999999999999', confirmationToken: 'offline-confirmation' } })

describe('the preview rows of the deleted restart and brain dump tests', () => {
  const [restartHeld] = restartPreview(todayCount(3))
  const withItems = (items) => [{ ...restartHeld, items }]
  it.each([
    ['a duplicate target', withItems([restartHeld.items[0], restartHeld.items[0], ...restartHeld.items.slice(2)])],
    ['a foreign target', withItems([{ ...restartHeld.items[0], entityId: '99999999-9999-4999-8999-999999999999' }, ...restartHeld.items.slice(1)])],
  ])('fails a restart with %s', async (_name, pendingOperations) => {
    const { verdict } = await attempt('composition-restart-preview-en', { replies: [turnOf({ pendingOperations })], habits: restartHabits, records: { habits: restartIds } })
    expect(verdict.pass).toBe(false)
  })

  it.each([['a restart', 'composition-restart-preview-en', { habits: restartHabits, records: { habits: restartIds } }],
    ['a brain dump', 'brain-dump-mixed-en', { habits: brainHabits, records: { water } }],
  ])('fails %s with no preview, and one whose write was saved where the case holds a preview', async (_name, id, setup) => {
    const none = 'The reply holds no preview and no question card.'
    expect((await attempt(id, { replies: [turnOf({})], held: [], ...setup })).verdict).toMatchObject({ pass: false, reason: none })
    const operations = [{ operationId: 'bulk_create_habits', status: 'Succeeded' }]
    expect((await attempt(id, { replies: [turnOf({ operations })], held: [], ...setup })).verdict).toMatchObject({ pass: false, reason: none })
  })

  it('fails a brain dump that misses the task, and one that splits its items over two previews', async () => {
    expect((await brainDump('brain-dump-mixed-en', [stretch])).verdict.pass).toBe(false)
    const split = await attempt('brain-dump-mixed-en', { replies: [turnOf({ pendingOperations: [previewOf('createHabits', [dentist]),
      previewOf('createHabits', [stretch], '22222222-2222-4222-8222-222222222223')] })], habits: brainHabits, records: { water } })
    expect(await composition(split.response.output, { vars: split.vars })).toMatchObject({ pass: false, reason: 'Missing batch preview.' })
  })
})

describe('the saved state rows of the deleted approval tests', () => {
  const approvals = [
    ['a restart', (options) => heldRestart('composition-restart-approve-en', todayCount(3), options)],
    ['a brain dump', brainDumpMixed],
    ['a same-title split', (options) => attempt('same-title-card-en', { replies: answered, habits: sameTitleHabits, records: sameTitleRecords, ...options })],
  ]
  const defects = {
    'a write that saves nothing': { savesNothing: true },
    'a saved date of another day': { afterDecision: (state) => { state.at(-2).dueDate = '2026-12-01' } },
    'a saved schedule of another kind': { afterDecision: (state) => { state.at(-2).frequencyUnit = 'Day' } },
    'a saved time of another hour': { afterDecision: (state) => { state.at(-1).dueTime = '23:00:00' } },
    'a second record for one request': { afterDecision: (state) => { state.push({ ...state.at(-1), id: '55555555-5555-4555-8555-555555555555' }) } },
  }
  it.each([['a restart', approvals[0][1], 'a write that saves nothing'],
    ...Object.keys(defects).map((defect) => ['a brain dump', brainDumpMixed, defect])])('fails %s after %s', async (_name, run, defect) => {
    const { verdict } = await run(defects[defect])
    expect(verdict.pass).toBe(false)
    expect(verdict.reason).not.toBe('The saved state matches the approved changes.')
  })

  it.each(approvals)('names the failed confirmation of %s and never executes', async (_name, run) => {
    const { verdict, fixture } = await run({ confirmReply: confirmFails })
    expect(verdict).toMatchObject({ pass: false, reason: expect.stringContaining('Approval or the saved state readback failed') })
    expect(verdict.reason).toContain('HTTP 503')
    expect(approvedPaths(fixture)).toEqual(['confirm'])
  })

  it.each(approvals.flatMap(([name, run]) => [[name, 'holds no token', run, confirmWithoutToken], [name, 'is bound to another preview', run, confirmForAnother]]))(
    'never executes %s when the confirmation %s', async (_name, _defect, run, confirmReply) => {
    const { verdict, fixture } = await run({ confirmReply })
    expect(verdict).toMatchObject({ pass: false, reason: expect.stringContaining('Approval confirmation lacks its bound token.') })
    expect(approvedPaths(fixture)).toEqual(['confirm'])
  })

  it.each([
    ['composition-restart-approve-en', { replies: [turnOf({ pendingOperations: restartPreview(todayCount(3)) })], habits: restartHabits, records: { habits: restartIds } }],
    ['composition-restart-reject-en', { replies: [turnOf({ pendingOperations: restartPreview(todayCount(3)) })], habits: restartHabits, records: { habits: restartIds } }],
    ['brain-dump-mixed-en', { replies: [turnOf({ pendingOperations: [previewOf('createHabits', [dentist, stretch])] })], habits: brainHabits, records: { water } }],
    ['same-title-card-en', { replies: answered, habits: sameTitleHabits, records: sameTitleRecords }],
  ])('fails %s that has no saved state readback', async (id, setup) => {
    const { vars, response } = await attempt(id, setup)
    delete response.output.readback
    expect(outcome(response.output, { vars })).toMatchObject({ pass: false, reason: 'The approved preview has no saved state readback.' })
  })
})
