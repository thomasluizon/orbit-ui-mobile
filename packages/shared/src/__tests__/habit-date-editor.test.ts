import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dateInterpretationSchema, type DateInterpretation } from '../types/habit'
import type { DateInterpretationContext } from '../utils/date-interpretation-session'
import { HabitDateEditor, type DateEditorSnapshot } from '../utils/habit-date-editor'

const interpretation = dateInterpretationSchema.parse({ date: '2026-10-26', referenceDate: '2026-10-20' })

function createAdapter(overrides: Partial<DateInterpretationContext> = {}) {
  const context: DateInterpretationContext = {
    account: 1,
    locale: 'en',
    timeZone: 'America/Sao_Paulo',
    referenceDate: '2026-10-20',
    type: 'task',
    schedule: 'oneTime',
    cadence: { unit: null, quantity: null, days: [], intervalWeeks: 1 },
    date: '2026-10-20',
    endDate: '',
    phrase: '',
    ...overrides,
  }
  const fields = { dueDate: context.date, datePhrase: context.phrase, dateIssue: '' }
  const requests: {
    input: { phrase: string; language: string }
    signal: AbortSignal
    resolve: (response: DateInterpretation) => void
    reject: (error: Error) => void
  }[] = []
  const adapter = {
    owner: fields,
    generalLocked: false,
    applyRecurrence: (schedule: import('../utils/habit-recurrence-phrase').HabitRecurrence) => { context.schedule = schedule.flexible ? 'flexible' : 'recurring'; context.cadence = { unit: schedule.unit, quantity: schedule.quantity, days: schedule.days, intervalWeeks: schedule.intervalWeeks } },
    context: () => ({ ...context, date: fields.dueDate, phrase: fields.datePhrase }),
    write: (field: keyof typeof fields, value: string) => { fields[field] = value },
    request: (input: { phrase: string; language: string }, signal: AbortSignal) =>
      new Promise<DateInterpretation>((resolve, reject) => { requests.push({ input, signal, resolve, reject }) }),
    failure: (error: unknown) => error instanceof Error ? error.message : 'Consultation failed',
    isCapacity: () => false,
  }
  return { adapter, context, fields, requests }
}

function createEditor(overrides: Partial<DateInterpretationContext> = {}) {
  const harness = createAdapter(overrides)
  const editor = new HabitDateEditor(harness.adapter)
  editor.open()
  editor.sync()
  return { ...harness, editor }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
const debounce = () => vi.advanceTimersByTimeAsync(700)

describe('habit date editor lifecycle', () => {
  it.each(['segunda', 'segunda-feira', 'seg', 'próxima segunda', 'monday', 'mon', 'next Monday'])('resolves a task weekday %s instead of requiring Habit', (phrase) => {
    const { editor, fields, context } = createEditor({ referenceDate: '2026-10-26', date: '2026-10-26' })
    editor.setPhrase(phrase)
    editor.validate()
    expect(fields).toMatchObject({ dueDate: '2026-11-02', datePhrase: phrase, dateIssue: '' })
    expect(context.cadence.unit).toBeNull()
  })

  it.each(['toda segunda', 'every Monday'])('requires Habit for the recurring task phrase %s', (phrase) => {
    const { editor, fields } = createEditor()
    editor.setPhrase(phrase)
    expect(fields.dateIssue).toBe('habits.form.recurrenceRequiresHabit')
  })

  it.each([
    ['every Monday from next week', '2026-10-26'],
    ['toda segunda a partir da próxima semana', '2026-10-26'],
    ['daily from tomorrow', '2026-10-21'],
    ['todo dia a partir de dia 23', '2026-10-23'],
  ])('applies the explicit start in %s', (phrase, date) => {
    const { editor, fields, context } = createEditor({ type: 'habit', schedule: 'recurring' })
    editor.setPhrase(phrase)
    expect(fields).toMatchObject({ dueDate: date, dateIssue: '' })
    expect(context.cadence.unit).toBe('Day')
  })

  it.each(['daily from 31 February', 'every Monday from after vacation'])('keeps schedule and calendar unchanged for unresolved starts: %s', (phrase) => {
    const { editor, fields, context } = createEditor({ type: 'habit', schedule: 'recurring' })
    editor.setPhrase(phrase)
    expect(fields.dueDate).toBe('2026-10-20')
    expect(fields.dateIssue).not.toBe('')
    expect(context.cadence.unit).toBeNull()
  })

  it('keeps an unapplied explicit recurrence start unresolved after account context loads', () => {
    const { editor, context, fields } = createEditor({ type: 'habit', schedule: 'recurring', timeZone: undefined, referenceDate: '', cadence: { unit: 'Day', quantity: 1, days: [], intervalWeeks: 1 } })
    editor.setPhrase('every Monday from next week')
    expect(editor.getSnapshot().status).toBe('unavailable')
    context.timeZone = 'UTC'
    context.referenceDate = '2026-10-20'
    editor.sync()
    editor.validate()
    expect(fields.dateIssue).not.toBe('')
    expect(fields.dueDate).toBe('2026-10-20')
    expect(context.cadence.days).toEqual([])
    editor.setPhrase(fields.datePhrase)
    editor.validate()
    expect(fields.dateIssue).toBe('')
    expect(fields.dueDate).toBe('2026-10-26')
    expect(context.cadence.days).toEqual(['Monday'])
  })

  it('requires the deliberate Habit choice before applying retained Task wording', () => {
    const { editor, fields, context } = createEditor()
    editor.setPhrase('weekly')
    expect(fields.dateIssue).toBe('habits.form.recurrenceRequiresHabit')
    context.type = 'habit'
    context.schedule = 'general'
    editor.sync()
    expect(context.cadence.unit).toBeNull()
    editor.chooseType()
    expect(context.cadence.unit).toBe('Week')
    expect(fields.dateIssue).toBe('')
    context.cadence.unit = 'Month'
    editor.sync()
    editor.validate()
    editor.close()
    editor.open()
    editor.sync()
    expect(context.cadence.unit).toBe('Month')
    expect(fields.dateIssue).toBe('')
  })

  it('keeps inherited General locked and reports the existing parent mismatch on a deliberate Habit choice', () => {
    const { editor, adapter, fields, context, requests } = createEditor()
    editor.setPhrase('weekly')
    adapter.generalLocked = true
    context.type = 'habit'
    context.schedule = 'general'
    editor.chooseType()
    editor.sync()
    editor.validate()
    expect(context.cadence.unit).toBeNull()
    expect(context.schedule).toBe('general')
    expect(fields.dateIssue).toBe('errors.api.generalMismatchWithParent')
    adapter.generalLocked = false
    editor.sync()
    editor.validate()
    expect(context.schedule).toBe('general')
    expect(context.cadence.unit).toBeNull()
    expect(fields.dateIssue).toBe('')
    expect(requests).toHaveLength(0)
  })

  it('does not apply old recognition when the form or account is replaced', () => {
    const original = createEditor({ type: 'habit', schedule: 'recurring' })
    original.editor.setPhrase('weekly')
    const replacement = createAdapter({ type: 'habit', schedule: 'recurring', phrase: 'weekly', cadence: { unit: 'Year', quantity: 2, days: [], intervalWeeks: 1 } })
    original.editor.configure(replacement.adapter)
    original.editor.sync()
    replacement.context.account++
    original.editor.sync()
    expect(replacement.context.cadence.unit).toBe('Year')
    expect(original.context.cadence.unit).toBe('Week')
    expect(replacement.requests).toHaveLength(0)
  })

  it('retains manual dates, newer wording and changed cadence instead of replaying recognition', () => {
    const { editor, fields, context } = createEditor({ type: 'habit', schedule: 'recurring' })
    editor.setPhrase('weekly')
    context.cadence.unit = 'Year'
    editor.sync()
    expect(context.cadence.unit).toBe('Year')
    expect(fields.dateIssue).toBe('')
    editor.selectDate('2026-10-23')
    editor.validate()
    expect(fields).toEqual({ dueDate: '2026-10-23', datePhrase: '', dateIssue: '' })
    editor.setPhrase('tomorrow')
    expect(fields.dueDate).toBe('2026-10-21')
    expect(context.cadence.unit).toBe('Year')
    editor.setPhrase('weekly')
    expect(context.cadence.unit).toBe('Week')
  })

  it('publishes current snapshots to subscribers and stops notifying each detached subscriber', () => {
    const { editor, fields, requests } = createEditor()
    const initial = editor.getSnapshot()
    editor.sync()
    expect(editor.getSnapshot()).toBe(initial)
    const active: DateEditorSnapshot[] = []
    const detached: DateEditorSnapshot[] = []
    const unsubscribeActive = editor.subscribe(() => active.push(editor.getSnapshot()))
    const unsubscribeDetached = editor.subscribe(() => detached.push(editor.getSnapshot()))

    editor.setPhrase('dia 26')
    const resolved = editor.getSnapshot()
    expect(resolved).toMatchObject({ status: 'resolved', pending: false, astra: false })
    expect(fields.dueDate).toBe('2026-10-26')
    expect(active).toEqual([resolved])
    expect(detached).toEqual([resolved])
    expect(editor.getSnapshot()).toBe(resolved)

    unsubscribeDetached()
    editor.setPhrase('31 de fevereiro')
    const invalid = editor.getSnapshot()
    expect(invalid.status).toBe('invalid')
    expect(active).toEqual([resolved, invalid])
    expect(detached).toEqual([resolved])
    unsubscribeActive()
    editor.selectDate('2026-10-27')
    expect(active).toEqual([resolved, invalid])
    expect(detached).toEqual([resolved])
    expect(requests).toHaveLength(0)
  })
})

describe('automatic date interpretation', () => {
  it('fills the final allowed request when its allowance refresh reaches the limit', async () => {
    const { editor, fields, requests } = createEditor()
    editor.setAvailability(true, false)
    editor.setPhrase('next holiday')
    await debounce()
    editor.setAvailability(true, true)
    requests[0]!.resolve(interpretation)
    await debounce()
    expect(fields.dueDate).toBe('2026-10-26')
    expect(editor.getSnapshot().astra).toBe(true)
  })

  it('debounces successive phrases, fills the form and retains Astra provenance until manual selection', async () => {
    const { editor, fields, requests } = createEditor()
    editor.setAvailability(true, false)
    editor.setPhrase('after')
    await vi.advanceTimersByTimeAsync(699)
    editor.setPhrase('after vacation')
    await vi.advanceTimersByTimeAsync(699)
    expect(requests).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(requests).toHaveLength(1)
    expect(requests[0]!.input).toEqual({ phrase: 'after vacation', language: 'en' })
    expect(editor.getSnapshot()).toMatchObject({ pending: true, astra: false })
    requests[0]!.resolve(interpretation)
    await debounce()
    editor.validate()
    expect(fields).toEqual({ dueDate: '2026-10-26', datePhrase: 'after vacation', dateIssue: '' })
    expect(editor.getSnapshot()).toMatchObject({ pending: false, astra: true, status: 'resolved' })
    editor.selectDate('2026-10-27')
    expect(editor.getSnapshot().astra).toBe(false)
    expect(fields).toEqual({ dueDate: '2026-10-27', datePhrase: '', dateIssue: '' })
    await debounce()
    expect(requests).toHaveLength(1)
  })

  it.each(['date', 'account', 'locale', 'timeZone', 'referenceDate', 'cadence', 'type', 'general', 'owner', 'close', 'offline'])('retires a delayed interpretation after %s', async (boundary) => {
    const { editor, adapter, fields, context, requests } = createEditor()
    editor.setAvailability(true, false)
    editor.setPhrase('after vacation')
    await debounce()
    if (boundary === 'date') editor.selectDate('2026-10-23')
    if (boundary === 'account') context.account++
    if (boundary === 'locale') context.locale = 'pt-BR'
    if (boundary === 'timeZone') context.timeZone = 'UTC'
    if (boundary === 'referenceDate') context.referenceDate = '2026-10-21'
    if (boundary === 'cadence') context.cadence.unit = 'Month'
    if (boundary === 'type') context.type = 'habit'
    if (boundary === 'general') context.schedule = 'general'
    if (boundary === 'owner') editor.configure({ ...adapter, owner: {} })
    if (boundary === 'close') editor.close()
    if (boundary === 'offline') editor.setAvailability(false, false)
    editor.sync()
    expect(requests[0]!.signal.aborted).toBe(true)
    requests[0]!.resolve(interpretation)
    await debounce()
    expect(fields.dueDate).toBe(boundary === 'date' ? '2026-10-23' : '2026-10-20')
    expect(editor.getSnapshot().astra).toBe(false)
    expect(requests).toHaveLength(1)
  })

  it.each([[false, false], [true, true]])('keeps the manual calendar when online=%s and allowance reached=%s', async (online, atLimit) => {
    const { editor, fields, requests } = createEditor()
    editor.setAvailability(online!, atLimit!)
    editor.setPhrase('no próximo feriado')
    await debounce()
    expect(requests).toHaveLength(0)
    expect(fields.dateIssue).toBe('habits.form.datePhraseUnresolved')
    editor.setPhrase('amanhã')
    expect(fields.dueDate).toBe('2026-10-21')
    editor.setPhrase('dia 3')
    expect(fields.dueDate).toBe('2026-11-03')
    editor.selectDate('2026-10-22')
    expect(fields.dateIssue).toBe('')
  })

  it('cancels a queued request before dispatch and automatically resumes unresolved wording when online', async () => {
    const { editor, requests } = createEditor()
    editor.setAvailability(true, false)
    editor.setPhrase('after vacation')
    editor.setAvailability(false, false)
    await debounce()
    expect(requests).toHaveLength(0)
    editor.setAvailability(true, false)
    await debounce()
    expect(requests).toHaveLength(1)
    editor.close()
  })

  it.each(['toda segunda', 'every Monday', 'weekly'])('never sends a task recurrence %s to Astra', async (phrase) => {
    const { editor, requests, fields } = createEditor()
    editor.setAvailability(true, false)
    editor.setPhrase(phrase)
    await debounce()
    expect(requests).toHaveLength(0)
    expect(fields.dateIssue).toBe('habits.form.recurrenceRequiresHabit')
  })

  it('retains weekly habit behavior and resolves an unsupported recurrence start automatically', async () => {
    const { editor, requests, context, fields } = createEditor({ type: 'habit', schedule: 'recurring' })
    editor.setAvailability(true, false)
    editor.setPhrase('segunda')
    expect(context.cadence.days).toEqual(['Monday'])
    await debounce()
    expect(requests).toHaveLength(0)
    editor.setPhrase('every Monday from after vacation')
    await debounce()
    requests[0]!.resolve(interpretation)
    await debounce()
    expect(context.cadence.days).toEqual(['Monday'])
    expect(fields.dueDate).toBe('2026-10-26')
    expect(fields.dateIssue).toBe('')
  })

  it.each([null, '2026-10-19'])('keeps unresolved feedback for a null date or stale reference %s', async (date) => {
    const { editor, fields, requests } = createEditor()
    editor.setAvailability(true, false)
    editor.setPhrase('after vacation')
    await debounce()
    requests[0]!.resolve({ date, referenceDate: date ? '2026-10-19' : '2026-10-20' })
    await debounce()
    expect(fields.dueDate).toBe('2026-10-20')
    expect(fields.dateIssue).not.toBe('')
    expect(editor.getSnapshot()).toMatchObject({ astra: false, pending: false })
    editor.selectDate('2026-10-22')
    expect(fields.dateIssue).toBe('')
  })

  it('keeps the new request pending when an aborted request returns', async () => {
    const { editor, requests, fields } = createEditor()
    editor.setAvailability(true, false)
    editor.setPhrase('after vacation')
    await debounce()
    editor.setPhrase('next holiday')
    await debounce()
    requests[0]!.resolve(interpretation)
    await debounce()
    expect(editor.getSnapshot().pending).toBe(true)
    requests[1]!.resolve(interpretation)
    await debounce()
    expect(fields.dueDate).toBe('2026-10-26')
    expect(editor.getSnapshot()).toMatchObject({ pending: false, astra: true })
  })

  it.each([false, true])('settles provider failure and capacity=%s without retrying', async (capacity) => {
    const { editor, adapter, fields, requests } = createEditor()
    editor.configure({ ...adapter, isCapacity: () => capacity })
    editor.setAvailability(true, false)
    editor.setPhrase('after vacation')
    await debounce()
    requests[0]!.reject(new Error('Consultation failed'))
    await debounce()
    expect(editor.getSnapshot()).toMatchObject({ pending: false, astra: false, failure: 'Consultation failed', capacity })
    editor.sync()
    await debounce()
    expect(requests).toHaveLength(1)
    editor.selectDate('2026-10-26')
    expect(fields.dateIssue).toBe('')
    expect(editor.getSnapshot()).toMatchObject({ failure: null, capacity: false })
  })
})
