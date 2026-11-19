import type { Question, QuestionAnswer } from '../types/question-block'
import { usesQuickOptions, type QuestionBlockState } from './question-block-core'

/** The one question a block shows, the validation it last answered, and the answer it last saw for that question. */
export interface QuestionInView {
  readonly index: number
  readonly attempt: number
  readonly answer: QuestionAnswer | undefined
}

export function startQuestionInView(questions: readonly Question[], state: QuestionBlockState): QuestionInView {
  return { index: 0, attempt: state.validationAttempt, answer: questions[0] ? state.answers[questions[0].id] : undefined }
}

function answeredByQuickOption(question: Question, answer: QuestionAnswer | undefined): boolean {
  if (!answer || answer.freeText || !usesQuickOptions(question)) return false
  return answer.boolean !== undefined || (answer.selectedIds?.length ?? 0) > 0
}

function at(questions: readonly Question[], state: QuestionBlockState, index: number, attempt: number): QuestionInView {
  const question = questions[index]
  return { index, attempt, answer: question ? state.answers[question.id] : undefined }
}

/**
 * The question in view after the block state changed. A failed submit shows the first question that still needs an answer.
 * A quick option answers and moves to the next question in one press. Returns the same object when nothing moved.
 */
export function followQuestionInView(view: QuestionInView, questions: readonly Question[], state: QuestionBlockState): QuestionInView {
  if (state.validationAttempt !== view.attempt) {
    const invalid = questions.findIndex((question) => state.invalidIds.includes(question.id))
    return at(questions, state, invalid >= 0 ? invalid : view.index, state.validationAttempt)
  }
  const question = questions[view.index]
  if (!question) return view
  const answer = state.answers[question.id]
  if (answer === view.answer) return view
  const advance = answeredByQuickOption(question, answer) && view.index < questions.length - 1
  return advance ? at(questions, state, view.index + 1, view.attempt) : { ...view, answer }
}

/** The question in view after a press on the previous or the next control. */
export function moveQuestionInView(view: QuestionInView, questions: readonly Question[], state: QuestionBlockState, step: -1 | 1): QuestionInView {
  const index = Math.min(Math.max(view.index + step, 0), questions.length - 1)
  return at(questions, state, index, view.attempt)
}
