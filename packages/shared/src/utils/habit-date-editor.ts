import { DateInterpretationSession, type DateInterpretationContext } from './date-interpretation-session'
import type { DateInterpretation } from '../types/habit'
import type { DatePhraseResult } from './date-phrase-parser'
import { readHabitRecurrencePhrase, type HabitRecurrence, type HabitRecurrencePhrase } from './habit-recurrence-phrase'
import { parseDatePhrase } from './date-phrase-parser'

interface DateEditorAdapter {
  owner: object
  generalLocked: boolean
  context: () => DateInterpretationContext
  applyRecurrence: (schedule: HabitRecurrence) => void
  write: (field: 'dueDate' | 'datePhrase' | 'dateIssue', value: string) => void
  request: (input: { phrase: string; language: string }, signal: AbortSignal) => Promise<DateInterpretation>
  failure: (error: unknown) => string
  isCapacity: (error: unknown) => boolean
}

export interface DateEditorSnapshot {
  candidate: string | null
  pending: boolean
  failure: string | null
  capacity: boolean
  status: DatePhraseResult['status'] | 'recurrence'
}

export class HabitDateEditor {
  private session = new DateInterpretationSession()
  private listeners = new Set<() => void>()
  private snapshot: DateEditorSnapshot = { candidate: null, pending: false, failure: null, capacity: false, status: 'empty' }
  private abort: AbortController | null = null
  private context = ''
  constructor(private adapter: DateEditorAdapter) {}
  configure(adapter: DateEditorAdapter): void {
    if (adapter.owner !== this.adapter.owner || adapter.generalLocked !== this.adapter.generalLocked) {
      this.abort?.abort()
      this.session.invalidate()
      this.context = ''
    }
    this.adapter = adapter
  }
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  getSnapshot = (): DateEditorSnapshot => this.snapshot
  open(): void { this.session.open() }
  close(): void { this.abort?.abort(); this.session.close() }

  private publish(patch: Partial<DateEditorSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }

  sync(): void {
    const context = this.adapter.context()
    if (JSON.stringify({ ...context, generalLocked: this.adapter.generalLocked }) === this.context) return
    this.abort?.abort()
    this.rememberContext()
    if (readHabitRecurrencePhrase(context.phrase)) {
      this.setRecurrenceIssue(context)
      this.publish({ candidate: null, pending: false, failure: null, capacity: false, status: 'recurrence' })
      return
    }
    if (context.phrase) {
      this.adapter.write('dateIssue', 'habits.form.dateStale')
    }
    this.publish({ candidate: null, pending: false, failure: null, capacity: false, status: this.session.parse(context).status })
  }

  setPhrase(phrase: string): void { this.readPhrase(phrase) }

  private readPhrase(phrase: string, choosingType = false): void {
    this.abort?.abort()
    this.session.invalidate()
    this.adapter.write('datePhrase', phrase)
    const context = { ...this.adapter.context(), phrase }
    const recurrence = readHabitRecurrencePhrase(phrase)
    if (recurrence) {
      this.applyRecurrence(context, choosingType, recurrence)
      this.setRecurrenceIssue(context)
      this.rememberContext()
      this.publish({ candidate: null, pending: false, failure: null, capacity: false, status: 'recurrence' })
      return
    }
    const result = this.session.parse(context)
    this.adapter.write('dateIssue', result.status === 'empty' || result.status === 'resolved' ? '' : result.status === 'invalid' ? 'habits.form.dateInvalid' : 'habits.form.datePhraseUnresolved')
    if (result.status === 'resolved') this.adapter.write('dueDate', result.date)
    this.rememberContext()
    this.publish({ candidate: null, pending: false, failure: null, capacity: false, status: result.status })
  }

  private applyRecurrence(context: DateInterpretationContext, choosingType: boolean, recurrence: HabitRecurrencePhrase): void {
    const start = recurrence.startPhrase ? parseDatePhrase(recurrence.startPhrase, context) : null
    if (start && start.status !== 'resolved') return
    if (context.type === 'habit' && !this.adapter.generalLocked && (context.schedule !== 'general' || choosingType) && context.date) {
      this.adapter.applyRecurrence(recurrence.schedule)
      if (start?.status === 'resolved') this.adapter.write('dueDate', start.date)
    }
  }

  private setRecurrenceIssue(context: DateInterpretationContext): void {
    const startPhrase = readHabitRecurrencePhrase(context.phrase)?.startPhrase
    const start = startPhrase ? parseDatePhrase(startPhrase, context) : null
    const issue = context.type === 'task' ? 'habits.form.recurrenceRequiresHabit' : context.type === 'habit' && this.adapter.generalLocked ? 'errors.api.generalMismatchWithParent' : start && start.status !== 'resolved' ? start.status === 'invalid' ? 'habits.form.dateInvalid' : 'habits.form.datePhraseUnresolved' : ''
    this.adapter.write('dateIssue', issue)
  }

  private rememberContext(): void {
    const context = this.adapter.context()
    this.context = JSON.stringify({ ...context, generalLocked: this.adapter.generalLocked })
    this.session.sync(context)
  }

  chooseType(): void {
    const { phrase } = this.adapter.context()
    if (readHabitRecurrencePhrase(phrase)) this.readPhrase(phrase, true)
    else this.sync()
  }

  selectDate(date: string): void {
    this.abort?.abort()
    this.session.invalidate()
    this.adapter.write('dueDate', date)
    this.adapter.write('datePhrase', '')
    this.adapter.write('dateIssue', '')
    this.rememberContext()
    this.publish({ candidate: null, pending: false, failure: null, capacity: false, status: 'empty' })
  }

  async ask(online: boolean, atLimit: boolean): Promise<void> {
    const context = this.adapter.context()
    if (readHabitRecurrencePhrase(context.phrase)) return
    const ticket = this.session.begin(context, online, atLimit)
    if (!ticket) return
    const abort = new AbortController()
    this.abort = abort
    this.publish({ pending: true, failure: null, capacity: false })
    try {
      const response = await this.adapter.request({ phrase: context.phrase, language: context.locale }, abort.signal)
      const result = this.session.receive(ticket, response, this.adapter.context())
      if (result === 'stale') {
        if (this.session.isCurrent(ticket, this.adapter.context())) this.adapter.write('dateIssue', 'habits.form.dateStale')
        return
      }
      this.adapter.write('dateIssue', result === 'proposed' ? '' : 'habits.form.datePhraseUnresolved')
      this.publish({ candidate: this.session.candidate?.date ?? null })
    } catch (error) {
      if (this.session.isCurrent(ticket, this.adapter.context())) this.publish({ failure: this.adapter.failure(error), capacity: this.adapter.isCapacity(error) })
    } finally {
      this.session.finish(ticket)
      if (this.session.isCurrent(ticket, this.adapter.context()) || !this.session.pending) this.publish({ pending: false })
    }
  }

  validate(): void {
    this.sync()
    if (this.session.candidate) this.adapter.write('dateIssue', 'habits.form.dateConfirmationRequired')
  }

  accept(): boolean {
    const date = this.session.accept(this.adapter.context())
    if (!date) {
      this.adapter.write('dateIssue', 'habits.form.dateStale')
      this.publish({ candidate: null })
      return false
    }
    this.selectDate(date)
    return true
  }
}
