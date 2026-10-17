import type { UpdateGoalProgressRequest } from '../types/goal'
import { validateGoalProgressInput } from '../utils/goal-form'

export interface GoalProgressEntryState {
  initialText: string
  value: string
  note: string
  submitted: boolean
  focusRequest: number
  busy: boolean
  failure: unknown
}

type GoalProgressEntryAction =
  | { type: 'value'; value: string }
  | { type: 'note'; note: string }
  | { type: 'invalid' }
  | { type: 'begin' }
  | { type: 'failure'; failure: unknown }
  | { type: 'finish' }

export function createGoalProgressEntry(initialValue: number): GoalProgressEntryState {
  return { initialText: String(initialValue), value: String(initialValue), note: '', submitted: false, focusRequest: 0, busy: false, failure: null }
}

export function reduceGoalProgressEntry(state: GoalProgressEntryState, action: GoalProgressEntryAction): GoalProgressEntryState {
  switch (action.type) {
    case 'value': return { ...state, value: action.value }
    case 'note': return { ...state, note: action.note }
    case 'invalid': return { ...state, submitted: true, focusRequest: state.focusRequest + 1 }
    case 'begin': return { ...state, submitted: true, busy: true, failure: null }
    case 'failure': return { ...state, failure: action.failure }
    case 'finish': return { ...state, busy: false }
  }
}

export function getGoalProgressEntryRequest(value: string, note: string, targetValue: number): { errorKey: string; request: null } | { errorKey: null; request: UpdateGoalProgressRequest } {
  const errorKey = validateGoalProgressInput(value)
  if (errorKey) return { errorKey, request: null }
  return { errorKey: null, request: { currentValue: Math.min(Number(value), targetValue), note: note.trim() || undefined } }
}
