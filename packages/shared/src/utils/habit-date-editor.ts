import { DateInterpretationSession, type DateInterpretationContext } from './date-interpretation-session'
import type { DateInterpretation } from '../types/habit'
import type { DatePhraseResult } from './date-phrase-parser'
import { readHabitRecurrencePhrase, type HabitRecurrence, type HabitRecurrencePhrase } from './habit-recurrence-phrase'
import { parseDatePhrase, readDateWeekday } from './date-phrase-parser'

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
  astra: boolean
  pending: boolean
  failure: string | null
  capacity: boolean
  status: DatePhraseResult['status'] | 'recurrence'
}

export class HabitDateEditor {
  private session = new DateInterpretationSession()
  private listeners = new Set<() => void>()
  private snapshot: DateEditorSnapshot = { astra: false, pending: false, failure: null, capacity: false, status: 'empty' }
  private abort: AbortController | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private online = false
  private atLimit = true
  private context = ''
  private appliedRecurrencePhrase: string | null = null
  constructor(private adapter: DateEditorAdapter) {}
  configure(adapter: DateEditorAdapter): void {
    if (adapter.owner !== this.adapter.owner || adapter.generalLocked !== this.adapter.generalLocked) {
      this.cancel()
      this.session.invalidate()
      this.context = ''
      this.appliedRecurrencePhrase = null
    }
    this.adapter = adapter
  }
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  getSnapshot = (): DateEditorSnapshot => this.snapshot
  open(): void { this.session.open(); this.scheduleInterpretation() }
  close(): void { this.cancel(); this.session.close() }

  private cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.abort?.abort()
  }

  setAvailability(online: boolean, atLimit: boolean): void {
    if (online === this.online && atLimit === this.atLimit) return
    this.online = online
    this.atLimit = atLimit
    if (online && atLimit && this.snapshot.pending) return
    if (!online || atLimit) {
      this.cancel()
      this.session.invalidate()
      this.publish({ pending: false })
    } else this.scheduleInterpretation()
  }

  private scheduleInterpretation(): void {
    if (this.timer !== null || this.snapshot.pending || this.snapshot.astra || !this.online || this.atLimit) return
    if (!['unsupported', 'ambiguous', 'invalid'].includes(this.snapshot.status)) return
    const context = this.adapter.context()
    if (context.type === 'task' && this.readRecurrence(context)) return
    this.timer = setTimeout(() => { this.timer = null; void this.interpret() }, 700)
  }

  private publish(patch: Partial<DateEditorSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }

  sync(): void {
    const context = this.adapter.context()
    if (JSON.stringify({ ...context, generalLocked: this.adapter.generalLocked }) === this.context) return
    this.cancel()
    this.rememberContext()
    if (this.readRecurrence(context)) {
      this.setRecurrenceIssue(context)
      this.publish({ astra: false, pending: false, failure: null, capacity: false, status: this.recurrenceStatus(context) })
      return
    }
    if (context.phrase) {
      this.adapter.write('dateIssue', 'habits.form.dateStale')
    }
    this.publish({ astra: false, pending: false, failure: null, capacity: false, status: this.session.parse(context).status })
  }

  setPhrase(phrase: string): void { this.readPhrase(phrase) }

  private readPhrase(phrase: string, choosingType = false): void {
    this.cancel()
    this.session.invalidate()
    this.appliedRecurrencePhrase = null
    this.adapter.write('datePhrase', phrase)
    const context = { ...this.adapter.context(), phrase }
    const recurrence = this.readRecurrence(context)
    if (recurrence) {
      this.applyRecurrence(context, choosingType, recurrence)
      this.setRecurrenceIssue(context)
      this.rememberContext()
      this.publish({ astra: false, pending: false, failure: null, capacity: false, status: this.recurrenceStatus(context) })
      this.scheduleInterpretation()
      return
    }
    const result = this.session.parse(context)
    this.adapter.write('dateIssue', result.status === 'empty' || result.status === 'resolved' ? '' : result.status === 'invalid' ? 'habits.form.dateInvalid' : 'habits.form.datePhraseUnresolved')
    if (result.status === 'resolved') this.adapter.write('dueDate', result.date)
    this.rememberContext()
    this.publish({ astra: false, pending: false, failure: null, capacity: false, status: result.status })
    this.scheduleInterpretation()
  }

  private readRecurrence(context: DateInterpretationContext): HabitRecurrencePhrase | null {
    if (context.type === 'task' && readDateWeekday(context.phrase) !== null) return null
    return readHabitRecurrencePhrase(context.phrase)
  }

  private applyRecurrence(context: DateInterpretationContext, choosingType: boolean, recurrence: HabitRecurrencePhrase): void {
    const start = recurrence.startPhrase ? parseDatePhrase(recurrence.startPhrase, context) : null
    if (start && start.status !== 'resolved') return
    if (this.canApplyRecurrence(context, choosingType)) {
      this.adapter.applyRecurrence(recurrence.schedule)
      if (start?.status === 'resolved') {
        this.adapter.write('dueDate', start.date)
        this.appliedRecurrencePhrase = context.phrase
      }
    }
  }

  private canApplyRecurrence(context: DateInterpretationContext, choosingType = false): boolean {
    return context.type === 'habit' && !this.adapter.generalLocked && (context.schedule !== 'general' || choosingType) && Boolean(context.date)
  }

  private recurrenceStatus(context: DateInterpretationContext): DateEditorSnapshot['status'] {
    const startPhrase = this.readRecurrence(context)?.startPhrase
    const start = startPhrase ? parseDatePhrase(startPhrase, context) : null
    if (!start) return 'recurrence'
    if (start.status !== 'resolved') return start.status
    return this.appliedRecurrencePhrase === context.phrase ? 'recurrence' : 'unavailable'
  }

  private setRecurrenceIssue(context: DateInterpretationContext): void {
    const status = this.recurrenceStatus(context)
    const issue = context.type === 'task' ? 'habits.form.recurrenceRequiresHabit' : context.type === 'habit' && this.adapter.generalLocked ? 'errors.api.generalMismatchWithParent' : status !== 'recurrence' ? status === 'invalid' ? 'habits.form.dateInvalid' : 'habits.form.datePhraseUnresolved' : ''
    this.adapter.write('dateIssue', issue)
  }

  private rememberContext(): void {
    const context = this.adapter.context()
    this.context = JSON.stringify({ ...context, generalLocked: this.adapter.generalLocked })
    this.session.sync(context)
  }

  chooseType(): void {
    const context = this.adapter.context()
    if (this.readRecurrence(context) || readDateWeekday(context.phrase) !== null) this.readPhrase(context.phrase, true)
    else this.sync()
    this.scheduleInterpretation()
  }

  selectDate(date: string): void {
    this.cancel()
    this.session.invalidate()
    this.adapter.write('dueDate', date)
    this.adapter.write('datePhrase', '')
    this.adapter.write('dateIssue', '')
    this.rememberContext()
    this.publish({ astra: false, pending: false, failure: null, capacity: false, status: 'empty' })
  }

  private async interpret(): Promise<void> {
    const context = this.adapter.context()
    if (context.type === 'task' && this.readRecurrence(context)) return
    const ticket = this.session.begin(context, this.online, this.atLimit)
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
      if (result === 'proposed') this.applyInterpretation()
      else this.adapter.write('dateIssue', 'habits.form.datePhraseUnresolved')
    } catch (error) {
      if (this.session.isCurrent(ticket, this.adapter.context())) this.publish({ failure: this.adapter.failure(error), capacity: this.adapter.isCapacity(error) })
    } finally {
      this.session.finish(ticket)
      if (this.abort === abort) this.publish({ pending: false })
    }
  }

  private applyInterpretation(): void {
    const context = this.adapter.context()
    const recurrence = this.readRecurrence(context)
    if (recurrence && !this.canApplyRecurrence(context)) return
    const date = this.session.accept(context)
    if (!date) return
    if (recurrence) this.adapter.applyRecurrence(recurrence.schedule)
    this.adapter.write('dueDate', date)
    this.adapter.write('dateIssue', '')
    this.rememberContext()
    this.publish({ astra: true, status: 'resolved' })
  }

  validate(): void { this.sync() }
}
