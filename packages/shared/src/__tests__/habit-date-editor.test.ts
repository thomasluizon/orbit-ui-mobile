import { describe, expect, it } from 'vitest'
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

describe('habit date editor lifecycle', () => {
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
    expect(resolved).toMatchObject({ status: 'resolved', pending: false, candidate: null })
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

  it('uses the latest form adapter for local dates, requests and accepted proposals', async () => {
    const original = createEditor()
    const replacement = createAdapter()
    original.editor.configure(replacement.adapter)
    original.editor.setPhrase('dia 26')
    expect(replacement.fields).toEqual({ dueDate: '2026-10-26', datePhrase: 'dia 26', dateIssue: '' })
    expect(original.fields).toEqual({ dueDate: '2026-10-20', datePhrase: '', dateIssue: '' })

    original.editor.setPhrase('after vacation')
    const pending = original.editor.ask(true, false)
    expect(original.requests).toHaveLength(0)
    expect(replacement.requests).toHaveLength(1)
    expect(replacement.requests[0]!.input).toEqual({ phrase: 'after vacation', language: 'en' })
    replacement.requests[0]!.resolve(interpretation)
    await pending
    expect(original.editor.accept()).toBe(true)
    expect(replacement.fields).toEqual({ dueDate: '2026-10-26', datePhrase: '', dateIssue: '' })
    expect(original.fields).toEqual({ dueDate: '2026-10-20', datePhrase: '', dateIssue: '' })
  })

  it('aborts on close, rejects a late proposal and permits a fresh explicit consultation after reopening', async () => {
    const { editor, fields, requests } = createEditor()
    editor.setPhrase('after vacation')
    const first = editor.ask(true, false)
    expect(requests).toHaveLength(1)
    editor.close()
    expect(requests[0]!.signal.aborted).toBe(true)
    await editor.ask(true, false)
    expect(requests).toHaveLength(1)
    requests[0]!.resolve(interpretation)
    await first
    expect(editor.getSnapshot()).toMatchObject({ candidate: null, pending: false, failure: null })
    expect(fields).toEqual({ dueDate: '2026-10-20', datePhrase: 'after vacation', dateIssue: 'habits.form.datePhraseUnresolved' })

    editor.open()
    expect(requests).toHaveLength(1)
    const second = editor.ask(true, false)
    expect(requests).toHaveLength(2)
    expect(requests[1]!.signal.aborted).toBe(false)
    requests[1]!.resolve(interpretation)
    await second
    expect(fields.dueDate).toBe('2026-10-20')
    expect(editor.getSnapshot()).toMatchObject({ candidate: '2026-10-26', pending: false })
    expect(editor.accept()).toBe(true)
    expect(fields).toEqual({ dueDate: '2026-10-26', datePhrase: '', dateIssue: '' })
  })

  it.each(['response', 'failure'] as const)('keeps the new account consultation pending when the old account returns a late %s', async (outcome) => {
    const original = createEditor()
    original.editor.setPhrase('after vacation')
    const first = original.editor.ask(true, false)
    const next = createAdapter({ account: 2, locale: 'pt-BR', date: '2026-10-24', phrase: 'depois das férias' })
    original.editor.configure(next.adapter)
    original.editor.sync()
    expect(original.requests[0]!.signal.aborted).toBe(true)
    const second = original.editor.ask(true, false)
    expect(next.requests).toHaveLength(1)
    expect(next.requests[0]!.input).toEqual({ phrase: 'depois das férias', language: 'pt-BR' })

    if (outcome === 'response') original.requests[0]!.resolve(interpretation)
    else original.requests[0]!.reject(new Error('Old account failure'))
    await first
    expect(original.editor.getSnapshot()).toMatchObject({ candidate: null, pending: true, failure: null, capacity: false })
    expect(next.fields).toEqual({ dueDate: '2026-10-24', datePhrase: 'depois das férias', dateIssue: 'habits.form.dateStale' })
    next.requests[0]!.resolve(interpretation)
    await second
    expect(original.editor.getSnapshot()).toMatchObject({ candidate: '2026-10-26', pending: false, failure: null })
    expect(original.editor.accept()).toBe(true)
    expect(next.fields).toEqual({ dueDate: '2026-10-26', datePhrase: '', dateIssue: '' })
    expect(original.fields.dueDate).toBe('2026-10-20')
  })

  it('rejects a response using another reference day and permits same-date manual recovery', async () => {
    const { editor, fields, requests } = createEditor()
    editor.setPhrase('after vacation')
    const pending = editor.ask(true, false)
    requests[0]!.resolve(dateInterpretationSchema.parse({ ...interpretation, referenceDate: '2026-10-21' }))
    await pending
    expect(fields).toEqual({ dueDate: '2026-10-20', datePhrase: 'after vacation', dateIssue: 'habits.form.dateStale' })
    expect(editor.getSnapshot()).toMatchObject({ candidate: null, pending: false })
    editor.selectDate('2026-10-20')
    editor.validate()
    expect(fields).toEqual({ dueDate: '2026-10-20', datePhrase: '', dateIssue: '' })
    expect(requests).toHaveLength(1)
  })

  it.each([
    { boundary: 'account day', change: { referenceDate: '2026-10-21' } },
    { boundary: 'end date', change: { endDate: '2026-10-25' } },
    { boundary: 'unloaded account timezone', change: { timeZone: undefined } },
  ])('rechecks $boundary when accepting a proposal without a prior render sync', async ({ change }) => {
    const { editor, context, fields, requests } = createEditor()
    editor.setPhrase('after vacation')
    const pending = editor.ask(true, false)
    requests[0]!.resolve(interpretation)
    await pending
    expect(editor.getSnapshot().candidate).toBe('2026-10-26')
    Object.assign(context, change)
    expect(editor.accept()).toBe(false)
    expect(fields).toEqual({ dueDate: '2026-10-20', datePhrase: 'after vacation', dateIssue: 'habits.form.dateStale' })
    expect(editor.getSnapshot().candidate).toBeNull()
    editor.selectDate('2026-10-24')
    editor.validate()
    expect(fields).toEqual({ dueDate: '2026-10-24', datePhrase: '', dateIssue: '' })
    expect(requests).toHaveLength(1)
  })

  it('preserves the date while account context loads and resolves locally once the account day is available', async () => {
    const { editor, context, fields, requests } = createEditor({ timeZone: undefined, referenceDate: '' })
    editor.setPhrase('tomorrow')
    expect(editor.getSnapshot().status).toBe('unavailable')
    expect(fields).toEqual({ dueDate: '2026-10-20', datePhrase: 'tomorrow', dateIssue: 'habits.form.datePhraseUnresolved' })
    await editor.ask(true, false)
    expect(requests).toHaveLength(0)

    context.timeZone = null
    context.referenceDate = '2026-10-20'
    editor.sync()
    expect(fields.dateIssue).toBe('habits.form.dateStale')
    editor.setPhrase('tomorrow')
    editor.validate()
    expect(fields).toEqual({ dueDate: '2026-10-21', datePhrase: 'tomorrow', dateIssue: '' })
    expect(editor.getSnapshot().status).toBe('resolved')
    expect(requests).toHaveLength(0)
  })

  it.each([
    { phrase: '31 de fevereiro', status: 'invalid', issue: 'habits.form.dateInvalid' },
    { phrase: '03/04', status: 'ambiguous', issue: 'habits.form.datePhraseUnresolved' },
  ])('requires manual resolution of $status wording without consulting Astra', async ({ phrase, status, issue }) => {
    const { editor, fields, requests } = createEditor()
    editor.setPhrase(phrase)
    await editor.ask(true, false)
    editor.validate()
    expect(editor.getSnapshot().status).toBe(status)
    expect(fields).toEqual({ dueDate: '2026-10-20', datePhrase: phrase, dateIssue: issue })
    expect(requests).toHaveLength(0)
    editor.selectDate('2026-10-20')
    editor.validate()
    expect(fields).toEqual({ dueDate: '2026-10-20', datePhrase: '', dateIssue: '' })
    expect(editor.getSnapshot()).toMatchObject({ status: 'empty', candidate: null, pending: false })
  })
})
