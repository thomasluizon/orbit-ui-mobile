import { DateInterpretationSession, type DateInterpretationContext } from './date-interpretation-session'
import type { DateInterpretation } from '../types/habit'
import type { DatePhraseResult } from './date-phrase-parser'

interface DateEditorAdapter {
  context: () => DateInterpretationContext
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
  status: DatePhraseResult['status']
}

export class HabitDateEditor {
  private session = new DateInterpretationSession()
  private listeners = new Set<() => void>()
  private snapshot: DateEditorSnapshot = { candidate: null, pending: false, failure: null, capacity: false, status: 'empty' }
  private abort: AbortController | null = null
  private context = ''
  constructor(private adapter: DateEditorAdapter) {}
  configure(adapter: DateEditorAdapter): void { this.adapter = adapter }
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
    const serialized = JSON.stringify(context)
    if (serialized === this.context) return
    const previous = this.context
    this.context = serialized
    this.abort?.abort()
    this.session.sync(context)
    if (previous && context.phrase) {
      this.adapter.write('dateIssue', 'habits.form.dateStale')
    }
    if (previous) this.publish({ candidate: null, pending: false, failure: null, capacity: false, status: context.phrase ? 'unavailable' : 'empty' })
  }

  setPhrase(phrase: string): void {
    this.abort?.abort()
    this.session.invalidate()
    this.adapter.write('datePhrase', phrase)
    const context = { ...this.adapter.context(), phrase }
    const result = this.session.parse(context)
    this.adapter.write('dateIssue', result.status === 'empty' || result.status === 'resolved' ? '' : result.status === 'invalid' ? 'habits.form.dateInvalid' : 'habits.form.datePhraseUnresolved')
    if (result.status === 'resolved') this.adapter.write('dueDate', result.date)
    this.context = JSON.stringify(this.adapter.context())
    this.session.sync(this.adapter.context())
    this.publish({ candidate: null, pending: false, failure: null, capacity: false, status: result.status })
  }

  selectDate(date: string): void {
    this.abort?.abort()
    this.session.invalidate()
    this.adapter.write('dueDate', date)
    this.adapter.write('datePhrase', '')
    this.adapter.write('dateIssue', '')
    this.context = JSON.stringify(this.adapter.context())
    this.session.sync(this.adapter.context())
    this.publish({ candidate: null, pending: false, failure: null, capacity: false, status: 'empty' })
  }

  async ask(online: boolean, atLimit: boolean): Promise<void> {
    const context = this.adapter.context()
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
      this.publish({ candidate: this.session.candidate?.date ?? null })
      if (result === 'unresolved') this.adapter.write('dateIssue', 'habits.form.datePhraseUnresolved')
    } catch (error) {
      if (this.session.isCurrent(ticket, this.adapter.context())) this.publish({ failure: this.adapter.failure(error), capacity: this.adapter.isCapacity(error) })
    } finally {
      this.session.finish(ticket)
      if (this.session.isCurrent(ticket, this.adapter.context()) || !this.session.pending) this.publish({ pending: false })
    }
  }

  validate(): void { this.sync() }

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
