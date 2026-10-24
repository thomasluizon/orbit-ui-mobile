import { describe, expect, it, vi } from 'vitest'
import { DateInterpretationSession, type DateInterpretationContext } from '../utils/date-interpretation-session'
import { HabitDateEditor } from '../utils/habit-date-editor'
import { buildCreateHabitRequest, buildUpdateHabitRequest, buildSubHabitRequest } from '../utils/habit-request-builders'
import { buildEmptyHabitFormValues, buildEditHabitFormState } from '../utils/habit-form-state'
import { createMockHabit } from './factories'

const context = (): DateInterpretationContext => ({ account: 1, locale: 'pt-BR', timeZone: 'America/Sao_Paulo', referenceDate: '2026-10-20', type: 'task', schedule: 'oneTime', cadence: { unit: null, quantity: null, days: [], intervalWeeks: 1 }, date: '2026-10-20', endDate: '', phrase: 'depois das férias' })
const response = { date: '2026-10-26', referenceDate: '2026-10-20' }

describe('explicit date consultation ownership', () => {
  it.each(['account', 'locale', 'timeZone', 'referenceDate', 'type', 'schedule', 'date', 'endDate', 'phrase'] as const)('rejects changed %s on response and acceptance', (field) => {
    const session = new DateInterpretationSession()
    const original = context()
    const ticket = session.begin(original, true, false)!
    expect(ticket).not.toBeNull()
    const changed = { ...original, [field]: field === 'account' ? 2 : 'changed' }
    expect(session.receive(ticket, response, changed)).toBe('stale')
    expect(session.candidate).toBeNull()
    const second = new DateInterpretationSession()
    const acceptedTicket = second.begin(original, true, false)!
    expect(second.receive(acceptedTicket, response, original)).toBe('proposed')
    expect(second.accept(changed)).toBeNull()
  })
  it('rejects old revisions even if the context returns to its original value', () => {
    const session = new DateInterpretationSession()
    const original = context()
    const first = session.begin(original, true, false)!
    session.sync({ ...original, phrase: 'different' })
    const second = session.begin(original, true, false)!
    expect(session.receive(second, response, original)).toBe('proposed')
    expect(session.receive(first, { ...response, date: '2026-10-28' }, original)).toBe('stale')
    expect(session.accept(original)).toBe('2026-10-26')
  })
  it('rejects server midnight, end-date violations, null replies and closed forms', () => {
    const original = context()
    const session = new DateInterpretationSession()
    const first = session.begin(original, true, false)!
    expect(session.receive(first, { ...response, referenceDate: '2026-10-21' }, original)).toBe('stale')
    session.finish(first)
    const short = { ...original, endDate: '2026-10-25' }
    const second = session.begin(short, true, false)!
    expect(session.receive(second, response, short)).toBe('unresolved')
    const third = session.begin(original, true, false)!
    expect(session.receive(third, { ...response, date: null }, original)).toBe('unresolved')
    const fourth = session.begin(original, true, false)!
    session.close()
    expect(session.receive(fourth, response, original)).toBe('stale')
    expect(session.begin(original, true, false)).toBeNull()
  })
  it('guards only the explicit action at offline, quota, General, duplicate, invalid and ambiguous boundaries', () => {
    const session = new DateInterpretationSession()
    const original = context()
    expect(session.begin(original, false, false)).toBeNull()
    expect(session.begin(original, true, true)).toBeNull()
    expect(session.begin({ ...original, schedule: 'general' }, true, false)).toBeNull()
    expect(session.begin({ ...original, type: null }, true, false)).toBeNull()
    for (const phrase of ['dia 26', '31 de fevereiro', '03/04']) expect(session.begin({ ...original, phrase }, true, false)).toBeNull()
    expect(session.begin(original, true, false)).not.toBeNull()
    expect(session.begin(original, true, false)).toBeNull()
  })
})

function editorHarness(capacity = false) {
  const current = context()
  const writes: Record<string, string> = {}
  let resolve!: (value: typeof response) => void
  let reject!: (reason: Error) => void
  const request = vi.fn(() => new Promise<typeof response>((done, fail) => { resolve = done; reject = fail }))
  const editor = new HabitDateEditor({ owner: current, generalLocked: false, applyRecurrence: () => {}, context: () => current,
    write: (field, value) => { writes[field] = value; if (field === 'dueDate') current.date = value; if (field === 'datePhrase') current.phrase = value },
    request, failure: () => 'provider failure', isCapacity: () => capacity })
  editor.sync()
  return { editor, request, writes, current, resolve: (value = response) => resolve(value), reject: () => reject(new Error('provider failure')) }
}

describe('date editor through actual request builders', () => {
  it('locally creates the exact task and reads the same task date back without Astra', () => {
    const { editor, request, writes } = editorHarness()
    editor.setPhrase('dia 26')
    expect(writes.dateIssue).toBe('')
    expect(writes.dueDate).toBe('2026-10-26')
    const values = { ...buildEmptyHabitFormValues(writes.dueDate), itemType: 'task' as const, title: 'migrar chats do ChatGPT para o Claude' }
    const payload = buildCreateHabitRequest(values, [], [], [], [])
    expect(payload.dueDate).toBe('2026-10-26')
    expect(payload.startDate).toBeUndefined()
    const reopened = buildEditHabitFormState(createMockHabit({ ...payload, frequencyUnit: null, frequencyQuantity: null, dueDate: payload.dueDate!, startDate: '2026-10-20' }))
    expect(reopened.formValues).toMatchObject({ itemType: 'task', dueDate: '2026-10-26', title: values.title })
    expect(request).not.toHaveBeenCalled()
  })
  it('writes the recurring anchor, leaves the due cursor out, and preserves child create compatibility', () => {
    const values = { ...buildEmptyHabitFormValues('2026-10-26'), frequencyUnit: 'Day' as const, frequencyQuantity: 1 }
    expect(buildCreateHabitRequest(values, [], [], [], [])).toMatchObject({ startDate: '2026-10-26' })
    expect(buildCreateHabitRequest(values, [], [], [], []).dueDate).toBeUndefined()
    expect(buildUpdateHabitRequest(values, false, '2026-11-01', [], [])).toMatchObject({ startDate: '2026-10-26', clearEndDate: true })
    expect(buildUpdateHabitRequest(values, false, '', [], []).dueDate).toBeUndefined()
    expect(buildSubHabitRequest(values, [], []).dueDate).toBe('2026-10-26')
    expect(buildSubHabitRequest(values, [], [])).not.toHaveProperty('startDate')
  })
  it('does not write an unaccepted proposal and accepts explicitly', async () => {
    const harness = editorHarness()
    harness.editor.setPhrase(harness.current.phrase)
    const pending = harness.editor.ask(true, false)
    expect(harness.request).toHaveBeenCalledOnce()
    await harness.editor.ask(true, false)
    expect(harness.request).toHaveBeenCalledOnce()
    harness.resolve()
    await pending
    expect(harness.current.date).toBe('2026-10-20')
    expect(harness.writes.dateIssue).toBe('')
    expect(harness.editor.getSnapshot()).toMatchObject({ candidate: '2026-10-26', pending: false })
    harness.editor.validate()
    expect(harness.writes.dateIssue).toBe('habits.form.dateConfirmationRequired')
    expect(harness.editor.accept()).toBe(true)
    expect(harness.current.date).toBe('2026-10-26')
    expect(harness.writes.dateIssue).toBe('')
  })
  it('replaces unresolved feedback with a proposal and validates its explicit confirmation', async () => {
    const harness = editorHarness()
    harness.editor.setPhrase(harness.current.phrase)
    expect(harness.writes.dateIssue).toBe('habits.form.datePhraseUnresolved')
    const pending = harness.editor.ask(true, false)
    harness.resolve()
    await pending
    expect(harness.writes.dateIssue).toBe('')
    expect(harness.current).toMatchObject({ date: '2026-10-20', phrase: 'depois das férias' })
    expect(harness.editor.getSnapshot()).toMatchObject({ candidate: '2026-10-26', pending: false, failure: null })
    harness.editor.validate()
    expect(harness.writes.dateIssue).toBe('habits.form.dateConfirmationRequired')
    expect(harness.current.date).toBe('2026-10-20')
    expect(harness.editor.accept()).toBe(true)
    harness.editor.validate()
    expect(harness.writes.dateIssue).toBe('')
    expect(harness.current).toMatchObject({ date: '2026-10-26', phrase: '' })
  })
  it.each(['2026-10-20', '2026-10-26', '2026-10-27'])('resolves proposal confirmation through manual selection of %s', async (date) => {
    const harness = editorHarness()
    harness.editor.setPhrase(harness.current.phrase)
    const pending = harness.editor.ask(true, false)
    harness.resolve()
    await pending
    harness.editor.validate()
    expect(harness.writes.dateIssue).toBe('habits.form.dateConfirmationRequired')
    harness.editor.selectDate(date)
    harness.editor.validate()
    expect(harness.editor.getSnapshot()).toMatchObject({ candidate: null, pending: false, failure: null })
    expect(harness.writes.dateIssue).toBe('')
    expect(harness.current).toMatchObject({ date, phrase: '' })
    expect(harness.request).toHaveBeenCalledOnce()
  })
  it('manual selection including the same date resolves errors and cancels a delayed result', async () => {
    const harness = editorHarness()
    harness.editor.setPhrase(harness.current.phrase)
    const pending = harness.editor.ask(true, false)
    harness.editor.selectDate('2026-10-20')
    harness.resolve()
    await pending
    expect(harness.current.date).toBe('2026-10-20')
    expect(harness.writes.datePhrase).toBe('')
    expect(harness.writes.dateIssue).toBe('')
    expect(harness.editor.getSnapshot()).toMatchObject({ candidate: null, pending: false })
  })
  it('keeps manual controls at provider failure, offline and quota without replay', async () => {
    const harness = editorHarness()
    harness.editor.setPhrase(harness.current.phrase)
    await harness.editor.ask(false, false)
    await harness.editor.ask(true, true)
    expect(harness.request).not.toHaveBeenCalled()
    const pending = harness.editor.ask(true, false)
    harness.reject()
    await pending
    expect(harness.editor.getSnapshot().failure).toBe('provider failure')
    harness.editor.selectDate('2026-10-26')
    expect(harness.writes.dateIssue).toBe('')
    harness.editor.sync()
    expect(harness.request).toHaveBeenCalledOnce()
  })
  it('keeps a spend refusal neutral and clears it through manual selection', async () => {
    const harness = editorHarness(true)
    harness.editor.setPhrase(harness.current.phrase)
    const pending = harness.editor.ask(true, false)
    harness.reject()
    await pending
    expect(harness.editor.getSnapshot()).toMatchObject({ capacity: true, pending: false })
    harness.editor.selectDate('2026-10-26')
    expect(harness.editor.getSnapshot()).toMatchObject({ capacity: false, failure: null })
    expect(harness.writes.dateIssue).toBe('')
  })
  it('rechecks context on submit and after a proposal across midnight', async () => {
    const harness = editorHarness()
    harness.editor.setPhrase('tomorrow')
    harness.current.referenceDate = '2026-10-21'
    harness.editor.validate()
    expect(harness.writes.dateIssue).toBe('habits.form.dateStale')
    harness.editor.setPhrase('after vacation')
    const pending = harness.editor.ask(true, false)
    harness.resolve({ date: '2026-10-26', referenceDate: '2026-10-21' })
    await pending
    harness.current.referenceDate = '2026-10-22'
    expect(harness.editor.accept()).toBe(false)
    expect(harness.writes.dateIssue).toBe('habits.form.dateStale')
  })
})
