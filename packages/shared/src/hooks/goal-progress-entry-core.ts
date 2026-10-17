import type { UpdateGoalProgressRequest } from '../types/goal'
import { MAX_GOAL_PROGRESS_NOTE_LENGTH } from '../validation/constants'
import { validateGoalProgressInput } from '../utils/goal-form'

export interface GoalProgressEntryState {
  initialText: string
  value: string
  note: string
  submitted: boolean
  focusRequest: number
  noteFocusRequest: number
  busy: boolean
  failure: unknown
}

type GoalProgressEntryAction =
  | { type: 'value'; value: string }
  | { type: 'note'; note: string }
  | { type: 'invalid'; field?: 'note' }
  | { type: 'begin' }
  | { type: 'failure'; failure: unknown }
  | { type: 'finish' }

export function createGoalProgressEntry(initialValue: number): GoalProgressEntryState {
  return { initialText: String(initialValue), value: String(initialValue), note: '', submitted: false, focusRequest: 0, noteFocusRequest: 0, busy: false, failure: null }
}

export function reduceGoalProgressEntry(state: GoalProgressEntryState, action: GoalProgressEntryAction): GoalProgressEntryState {
  switch (action.type) {
    case 'value': return { ...state, value: action.value }
    case 'note': return { ...state, note: action.note }
    case 'invalid': return action.field === 'note'
      ? { ...state, submitted: true, noteFocusRequest: state.noteFocusRequest + 1 }
      : { ...state, submitted: true, focusRequest: state.focusRequest + 1 }
    case 'begin': return { ...state, submitted: true, busy: true, failure: null }
    case 'failure': return { ...state, failure: action.failure }
    case 'finish': return { ...state, busy: false }
  }
}

export function getGoalProgressEntryRequest(value: string, note: string, targetValue: number): { errorKey: string; errorField?: 'note'; request: null } | { errorKey: null; request: UpdateGoalProgressRequest } {
  const errorKey = validateGoalProgressInput(value)
  if (errorKey) return { errorKey, request: null }
  const trimmedNote = note.trim()
  if (trimmedNote.length > MAX_GOAL_PROGRESS_NOTE_LENGTH) return { errorKey: 'goals.form.progressNoteTooLong', errorField: 'note', request: null }
  return { errorKey: null, request: { currentValue: Math.min(Number(value), targetValue), note: trimmedNote || undefined } }
}
