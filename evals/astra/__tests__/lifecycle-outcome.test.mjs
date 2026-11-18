import { describe, expect, it } from 'vitest'
import { TOOL_NAME_KEYS, corpusTests, gradedByOutcome } from '../grade-method.mjs'
import { captures } from './fixtures/core-streams.mjs'
import { streams } from './fixtures/same-title-streams.mjs'
import { accountDate, addDays, attempt, corpus, itemOf, previewOf, storedHabit, turnOf } from './fixtures/lifecycle-case.mjs'

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

// Producer: the real staging capture of the owner request over one parent Water with six Water - 710ml children (#2127).
const { children } = captures.complete
const parent = '33333333-3333-4333-8333-333333333333'
const sameTitleHabits = [storedHabit(parent, 'Water'), ...children.map((id) => storedHabit(id, 'Water - 710ml'))]
const sameTitleRecords = { parent, children }
const answered = captures.complete.turns.map((turn) => turn.at(-1).response)
const withPreview = (pendingOperations) => ({ ...answered[1], pendingOperations })
const heldItems = answered[1].pendingOperations[0].items
const renames = heldItems.filter((item) => item.fields.some((field) => field.field === 'title'))
const deletes = heldItems.filter((item) => item.fields.some((field) => field.field === 'delete'))
const combined = (items) => [{ ...answered[1].pendingOperations[0], items }]

describe('a same-title case', () => {
  it('passes a preview of the requested split and reads the saved children back after the approval', async () => {
    const { verdict, fixture } = await attempt('same-title-card-en', { replies: answered, habits: sameTitleHabits, records: sameTitleRecords })
    expect(verdict).toMatchObject({ pass: true, reason: 'The saved state matches the approved changes.' })
    expect(fixture.calls.map((call) => call.path.split('/').at(-1))).toEqual(['snapshot', 'confirm', 'execute', 'snapshot'])
    expect(fixture.state.map((habit) => habit.title)).toEqual(['Water', 'Water - 1.18L', 'Water - 1.18L', 'Water - 1.18L', 'Water - 1.18L'])
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
const restartHabits = restartIds.map((id, index) => storedHabit(id, `Habit ${index}`, { dueDate: index < 4 ? addDays(-2) : accountDate }))
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

  it('runs the same case in pt-BR over the same preview', async () => {
    expect((await heldRestart('composition-restart-approve-pt-BR', todayCount(3))).verdict.pass).toBe(true)
  })
})

// Producer: PendingOperationChangePreviewer.BindReuseFieldsAsync gives a create that reuses a stored habit the record of that
// habit and each of its stored values, and PreserveReuseParent adds the parent row that changes nothing.
const water = '22222222-2222-4222-8222-222222222222'
const brainHabits = [storedHabit(water, 'Water')]
const dentist = itemOf(null, 'Call the dentist', { title: [null, 'Call the dentist'], frequency_unit: [null, 'OneTime'], due_date: [null, addDays(1), 'date'] })
const stretch = itemOf(null, 'Stretch', { title: [null, 'Stretch'], frequency_unit: [null, 'Day'], frequency_quantity: [null, '1', 'number'],
  due_date: [null, accountDate, 'date'], due_time: [null, '08:00', 'time'] })
const reused = itemOf(water, 'Water', { frequency_unit: ['Day', 'Day'], parent_habit_id: ['No parent', 'No parent'] })
const idea = itemOf(null, 'Read', { title: [null, 'Read'], frequency_unit: [null, 'Day'], frequency_quantity: [null, '1', 'number'], due_date: [null, accountDate, 'date'] })
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
    ['the habit at another time', [dentist, itemOf(null, 'Stretch', { title: [null, 'Stretch'], frequency_unit: [null, 'Day'], frequency_quantity: [null, '1'], due_date: [null, accountDate], due_time: [null, '09:00'] })], 'The preview does not create exactly the records of the request.'],
    ['the task as a daily habit', [itemOf(null, 'Call the dentist', { title: [null, 'Call the dentist'], frequency_unit: [null, 'Day'], due_date: [null, addDays(1)] }), stretch], 'The preview does not create exactly the records of the request.'],
    ['the task today', [itemOf(null, 'Call the dentist', { title: [null, 'Call the dentist'], frequency_unit: [null, 'OneTime'], due_date: [null, accountDate] }), stretch], 'The preview does not create exactly the records of the request.'],
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
    const duplicate = await brainDump('brain-dump-reuse-en', [dentist, stretch, itemOf(null, 'Water', { title: [null, 'Water'], frequency_unit: [null, 'Day'] })])
    expect(duplicate.verdict.pass).toBe(false)
  })

  it('adds one idea of the assistant to the same preview', async () => {
    expect((await brainDump('brain-dump-ideas-en', [dentist, stretch, idea])).verdict.pass).toBe(true)
    const without = await brainDump('brain-dump-ideas-en', [dentist, stretch])
    expect(without.verdict).toMatchObject({ pass: false, reason: expect.stringContaining('The preview does not create exactly the records of the request.') })
  })

  it('runs the pt-BR cases over the same shapes', async () => {
    expect((await brainDump('brain-dump-mixed-pt-BR', [itemOf(null, 'Ligar para o dentista', { title: [null, 'Ligar para o dentista'], frequency_unit: [null, 'OneTime'], due_date: [null, addDays(1)] }),
      itemOf(null, 'Alongar', { title: [null, 'Alongar'], frequency_unit: [null, 'Day'], frequency_quantity: [null, '1'], due_date: [null, accountDate], due_time: [null, '08:00'] })])).verdict.pass).toBe(true)
  })
})
