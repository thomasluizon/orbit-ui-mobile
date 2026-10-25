import { parseDatePhrase, isCalendarDate, type DatePhraseResult } from './date-phrase-parser'
import type { DateInterpretation } from '../types/habit'

export interface DateInterpretationContext {
  account: number
  locale: string
  timeZone: string | null | undefined
  referenceDate: string
  type: string | null | undefined
  schedule: string
  cadence: {
    unit: string | null
    quantity: number | null
    days: string[]
    intervalWeeks: number
  }
  date: string
  endDate: string
  phrase: string
}

export interface DateConsultation {
  revision: number
  context: string
}

export class DateInterpretationSession {
  private revision = 0
  private context = ''
  private active = true
  private consultation: DateConsultation | null = null
  candidate: { date: string; ticket: DateConsultation; referenceDate: string } | null = null

  sync(context: DateInterpretationContext): void {
    const serialized = JSON.stringify(context)
    if (this.context === serialized) return
    this.context = serialized
    this.invalidate()
  }

  invalidate(): void {
    this.revision++
    this.candidate = null
    this.consultation = null
  }

  close(): void { this.active = false; this.invalidate() }
  open(): void { this.active = true }
  get pending(): boolean { return this.consultation !== null }

  parse(context: DateInterpretationContext): DatePhraseResult {
    return parseDatePhrase(context.phrase, context)
  }

  begin(context: DateInterpretationContext, online: boolean, atLimit: boolean): DateConsultation | null {
    this.sync(context)
    if (!this.active || this.pending || !online || atLimit || context.schedule === 'general' || !context.type || !['unsupported', 'ambiguous', 'invalid'].includes(this.parse(context).status)) return null
    const ticket = { revision: this.revision, context: this.context }
    this.consultation = ticket
    return ticket
  }

  isCurrent(ticket: DateConsultation, context: DateInterpretationContext): boolean {
    this.sync(context)
    return this.active && ticket.revision === this.revision && ticket.context === this.context
  }

  receive(ticket: DateConsultation, response: DateInterpretation, context: DateInterpretationContext): 'stale' | 'unresolved' | 'proposed' {
    if (!this.isCurrent(ticket, context) || response.referenceDate !== context.referenceDate) return 'stale'
    this.consultation = null
    if (!response.date || !isCalendarDate(response.date) || (context.endDate && response.date > context.endDate)) return 'unresolved'
    this.candidate = { date: response.date, ticket, referenceDate: response.referenceDate }
    return 'proposed'
  }

  finish(ticket: DateConsultation): void {
    if (this.consultation === ticket) this.consultation = null
  }

  accept(context: DateInterpretationContext): string | null {
    const candidate = this.candidate
    if (!candidate || !this.isCurrent(candidate.ticket, context) || candidate.referenceDate !== context.referenceDate || (context.endDate && candidate.date > context.endDate)) return null
    this.invalidate()
    return candidate.date
  }
}
