import type { Question, QuestionAnswer, QuestionBlock } from '../types/question-block'
import { isOnQuestionStep, questionAnswerSchema } from '../types/question-block'
import type { BlockAnswer } from '../types/chat'
import { blockAnswerErrorKey, formatBlockAnswer, isSameBlockAnswer, type AnswerBlockProps } from './block-answer'

export type QuestionBlockProps = Omit<AnswerBlockProps, 'definition'> & { block: QuestionBlock }
export type QuestionWords = { yes: string; no: string; answered: (options: string) => string; closed: string; alreadyAnswered: string; invalid: string; error: string; offline: string; limit: string; acting: string }
export interface QuestionControlProps {
  readonly question: Question
  readonly answer?: QuestionAnswer
  readonly disabled: boolean
  readonly controller: QuestionBlockController
  readonly words: { yes: string; no: string; recommended: string; freeText: string; required: string }
}

export function isQuestionAnswered(question: Question, answer: QuestionAnswer | undefined): boolean {
  if (!answer || answer.questionId !== question.id || !questionAnswerSchema.safeParse(answer).success) return false
  const selected = answer.selectedIds ?? []
  const custom = Boolean(answer.freeText?.trim())
  if (custom && !question.allowFreeText) return false
  if (question.type === 'singleChoice' || question.type === 'multipleChoice') {
    return answer.number === undefined && answer.boolean === undefined && selected.every(id => question.options.some(option => option.id === id)) &&
      (question.type === 'singleChoice' ? selected.length + Number(custom) === 1 : selected.length > 0 || custom)
  }
  if (selected.length || (custom && question.type !== 'yesNo')) return false
  if (question.type === 'yesNo') return answer.number === undefined && ((answer.boolean !== undefined) !== custom)
  if (answer.boolean !== undefined || answer.number === undefined) return false
  if (question.type === 'scale') return Number.isInteger(answer.number) && answer.number >= 1 && answer.number <= 5
  return answer.number >= question.min && answer.number <= question.max && isOnQuestionStep(answer.number, question.min, question.step)
}

export function formatQuestionNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 20 }).format(value)
}

export function questionAnswerLabels(block: QuestionBlock, answers: Record<string, QuestionAnswer>, words: Pick<QuestionWords, 'yes' | 'no'>, locale: string): string[] {
  return block.questions.map(question => {
    const answer = answers[question.id]
    if (!answer) return question.prompt
    const labels = question.type === 'singleChoice' || question.type === 'multipleChoice'
      ? question.options.filter(option => answer.selectedIds?.includes(option.id)).map(option => option.label) : []
    if (answer.number !== undefined) labels.push(`${formatQuestionNumber(answer.number, locale)}${question.type === 'slider' ? ` ${question.unit}` : ''}`)
    if (answer.boolean !== undefined) labels.push(answer.boolean ? words.yes : words.no)
    return `${question.prompt}: ${formatBlockAnswer(labels, answer.freeText, locale)}`
  })
}

export interface QuestionBlockState {
  answers: Record<string, QuestionAnswer>
  invalidIds: string[]
  validationAttempt: number
  acting: boolean
  settled: { text: string; answered: boolean } | null
  error: string | null
  uncertainAnswer: BlockAnswer | null
}

function payload(block: QuestionBlock, answers: QuestionBlockState['answers']): BlockAnswer {
  return { blockId: block.blockId, selectedIds: [], answers: block.questions.flatMap(question => {
    const answer = answers[question.id]
    return answer ? [{ ...answer, ...(answer.freeText !== undefined ? { freeText: answer.freeText.trim() || undefined } : {}) }] : []
  }) }
}

export function questionBlockStatus(props: QuestionBlockProps, state: QuestionBlockState, words: QuestionWords): { closed: string | null; answered: boolean; status: string; statusError: boolean; disabled: boolean; submitDisabled: boolean; completed: number } {
  const { interaction } = props
  const settled = props.savedAnswer ?? state.settled
  const closed = settled?.text ?? ((props.expired || Date.parse(props.block.expiresAtUtc) <= Date.now()) && !state.acting ? words.closed : null)
  const recovery = isSameBlockAnswer(payload(props.block, state.answers), state.uncertainAnswer)
  const status = state.acting ? words.acting : interaction && !interaction.isOnline ? words.offline
    : interaction?.atMessageLimit && !recovery ? words.limit : state.error ?? ''
  return { closed, answered: settled?.answered === true, status, statusError: Boolean(state.error && status === state.error),
    disabled: Boolean(closed || state.acting || interaction?.isSending || interaction?.dailyBudgetReached),
    submitDisabled: Boolean(closed || !interaction || state.acting || interaction.isSending || interaction.dailyBudgetReached || !interaction.isOnline || (interaction.atMessageLimit && !recovery)),
    completed: props.block.questions.filter(question => isQuestionAnswered(question, state.answers[question.id])).length }
}

export class QuestionBlockController {
  private state: QuestionBlockState = { answers: {}, invalidIds: [], validationAttempt: 0, acting: false, settled: null, error: null, uncertainAnswer: null }
  private readonly listeners = new Set<() => void>()
  getSnapshot = (): QuestionBlockState => this.state
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private update(patch: Partial<QuestionBlockState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }
  setAnswer = (question: Question, value: Omit<QuestionAnswer, 'questionId'>): void => {
    if (this.state.acting || this.state.settled) return
    this.update({ answers: { ...this.state.answers, [question.id]: { ...value, questionId: question.id } }, invalidIds: this.state.invalidIds.filter(id => id !== question.id) })
  }
  select = (question: Question, id: string): void => {
    const previous = this.state.answers[question.id]
    const selected = previous?.selectedIds ?? []
    this.setAnswer(question, question.type === 'multipleChoice'
      ? { ...previous, selectedIds: selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id] }
      : { selectedIds: [id] })
  }
  setFreeText = (question: Question, freeText: string): void => {
    const previous = question.type === 'multipleChoice' ? this.state.answers[question.id] : undefined
    this.setAnswer(question, { ...previous, freeText: freeText || undefined })
  }
  async submit(props: QuestionBlockProps, words: QuestionWords, locale: string): Promise<void> {
    if (questionBlockStatus(props, this.state, words).submitDisabled) return
    const invalidIds = props.block.questions.filter(question => !isQuestionAnswered(question, this.state.answers[question.id])).map(question => question.id)
    if (invalidIds.length) { this.update({ invalidIds, validationAttempt: this.state.validationAttempt + 1 }); return }
    const answer = payload(props.block, this.state.answers)
    this.update({ acting: true, error: null, uncertainAnswer: answer })
    const labels = questionAnswerLabels(props.block, this.state.answers, words, locale)
    try {
      const result = await props.interaction!.send({ kind: 'question', answer, labels })
      if (result.ok) this.update({ settled: { text: words.answered(formatBlockAnswer(labels, undefined, locale)), answered: true } })
      else if (result.dailyBudgetReached) this.update({ error: null, uncertainAnswer: null })
      else {
        const key = blockAnswerErrorKey(result.status)
        this.update(key === 'closed' || key === 'alreadyAnswered' ? { settled: { text: words[key], answered: false } } : { error: words[key] })
      }
    } catch { this.update({ error: words.error }) }
    finally { this.update({ acting: false }) }
  }
}
