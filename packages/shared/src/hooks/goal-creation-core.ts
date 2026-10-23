import type { CreateGoalRequest, GoalType } from '../types/goal'
import { validateGoalForm } from '../validation/goal-form'
import { buildGoalTitle, getFirstGoalDraftFieldError, getGoalDraftFieldErrorKeys, parseGoalTargetValue } from '../utils/goal-form'
import { getFriendlyErrorMessage } from '../utils/error-utils'
import type { StateHook, StateSetter } from './state-adapter'

export interface CreateGoalSheetProps {
  open: boolean
  onClose: () => void
  initialHabitIds?: string[]
  onCreated?: (goalId: string, habitIds: string[]) => void
}

interface GoalDraft {
  goalType: GoalType
  description: string
  targetValue: string
  unit: string
  deadline: string
  habitIds: string[]
}

type GoalField = 'description' | 'targetValue' | 'unit'
type GoalFields = Pick<GoalDraft, GoalField>
type Translate = (key: string) => string

interface GoalBackendErrors {
  fieldErrors: Partial<Record<GoalField, string>>
  clearBackendErrors: () => void
  reportBackendErrors: (error: unknown) => { field: GoalField | undefined; handled: boolean }
}

interface FocusTarget { focus: () => void }
export interface GoalDismissGuard {
  canDismiss: boolean
  showDiscardDialog: boolean
  requestDismiss: () => void
  cancelDismiss: () => void
  confirmDismiss: () => void
}

export interface GoalCreationAdapters<Input extends FocusTarget = FocusTarget> {
  useRef: (initial: null) => { current: Input | null }
  useEffect: (effect: () => void, dependencies: readonly unknown[]) => void
  useDismissGuard: (options: { isDirty: boolean; onDismiss: () => void }) => GoalDismissGuard
  useState: StateHook
  useCreateGoal: () => { isPending: boolean; mutateAsync: (request: CreateGoalRequest) => Promise<{ id: string }> }
  useBackendFieldErrors: (values: GoalFields, names: Record<GoalField, string>) => GoalBackendErrors
  getAccountGeneration: () => number
}

export interface GoalCreationOptions extends CreateGoalSheetProps {
  translate: Translate
  showError: (message: string) => void
  closeSheet: (afterDismiss: () => void, automatic?: boolean) => void
}

export interface GoalCreationState<Input> extends GoalDraft {
  descriptionRef: { current: Input | null }
  targetRef: { current: Input | null }
  unitRef: { current: Input | null }
  dismissGuard: GoalDismissGuard
  selectingHabits: boolean
  setSelectingHabits: StateSetter<boolean>
  focusRequest: { field: GoalField } | null
  fieldErrors: Record<string, string>
  formError: string
  isSubmitting: boolean
  isStreak: boolean
  isDirty: boolean
  dismiss: () => void
  onSubmit: () => Promise<void>
  setDescription: (value: string) => void
  setTargetValue: (value: string) => void
  setUnit: (value: string) => void
  setDeadline: (value: string) => void
  setHabitIds: (value: string[]) => void
  handleTypeChange: (type: GoalType) => void
}

export function createGoalDraft(habitIds: string[] = []): GoalDraft {
  return { goalType: 'Standard', description: '', targetValue: '', unit: '', deadline: '', habitIds }
}

export function isGoalDraftDirty(draft: GoalDraft, initialHabitIds: string[]): boolean {
  return draft.goalType !== 'Standard' || draft.description.trim().length > 0 ||
    draft.targetValue.trim().length > 0 || draft.unit.trim().length > 0 ||
    draft.deadline.length > 0 || draft.habitIds.join() !== initialHabitIds.join()
}

export function getGoalCreationError(draft: GoalDraft): { key: string; field: GoalField | '_form'; focusField: GoalField | undefined } | null {
  const key = validateGoalForm(draft.description, parseGoalTargetValue(draft.targetValue), draft.unit)
  if (!key) return null
  const first = getFirstGoalDraftFieldError(getGoalDraftFieldErrorKeys(draft.description, draft.targetValue, draft.unit))
  const fields: Record<string, GoalField> = {
    'goals.form.titleRequired': 'description', 'goals.form.titleTooLong': 'description',
    'goals.form.targetValueRequired': 'targetValue', 'goals.form.unitRequired': 'unit', 'goals.form.unitTooLong': 'unit',
  }
  return { key, field: fields[key] ?? '_form', focusField: key === 'goals.form.titleRequired' ? 'description' : first?.field }
}

export function buildGoalCreationRequest(draft: GoalDraft): CreateGoalRequest {
  return {
    title: buildGoalTitle(draft.description, draft.targetValue, draft.unit),
    targetValue: Number(draft.targetValue),
    unit: draft.unit.trim(),
    type: draft.goalType,
    habitIds: draft.habitIds,
    ...(draft.deadline ? { deadline: draft.deadline } : {}),
  }
}

export function createUseGoalCreation<Input extends FocusTarget>({ useState, useRef, useEffect, useDismissGuard, useCreateGoal, useBackendFieldErrors, getAccountGeneration }: GoalCreationAdapters<Input>) {
  return function useGoalCreation({ initialHabitIds = [], translate, showError, closeSheet, onClose, onCreated }: GoalCreationOptions): GoalCreationState<Input> {
    const [draft, setDraft] = useState(() => createGoalDraft(initialHabitIds))
    const [selectingHabits, setSelectingHabits] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [formError, setFormError] = useState('')
    const [focusRequest, setFocusRequest] = useState<{ field: GoalField } | null>(null)
    const descriptionRef = useRef(null)
    const targetRef = useRef(null)
    const unitRef = useRef(null)
    useEffect(() => {
      const targets = { description: descriptionRef, targetValue: targetRef, unit: unitRef }
      if (focusRequest) targets[focusRequest.field].current?.focus()
    }, [focusRequest])
    const mutation = useCreateGoal()
    const backend = useBackendFieldErrors(draft, { description: 'Title', targetValue: 'TargetValue', unit: 'Unit' })
    const error = getGoalCreationError(draft)
    const fieldErrors = { ...(submitted && error ? { [error.field]: translate(error.key) } : {}), ...backend.fieldErrors }
    const resetForm = () => {
      setDraft(createGoalDraft(initialHabitIds))
      setSubmitted(false)
      setFormError('')
      backend.clearBackendErrors()
    }
    const dismiss = () => {
      const generation = getAccountGeneration()
      closeSheet(() => {
        if (getAccountGeneration() !== generation) return
        resetForm()
        onClose()
      })
    }
    const onSubmit = async () => {
      setSubmitted(true)
      setFormError('')
      if (error) {
        showError(translate(error.key))
        if (error.focusField) setFocusRequest({ field: error.focusField })
        return
      }
      const generation = getAccountGeneration()
      try {
        const created = await mutation.mutateAsync(buildGoalCreationRequest(draft))
        if (getAccountGeneration() !== generation) return
        closeSheet(() => {
          if (getAccountGeneration() !== generation) return
          onCreated?.(created.id, draft.habitIds)
          onClose()
          resetForm()
        }, true)
      } catch (failure: unknown) {
        if (getAccountGeneration() !== generation) return
        const { field, handled } = backend.reportBackendErrors(failure)
        if (field) setFocusRequest({ field })
        if (!handled) setFormError(getFriendlyErrorMessage(failure, translate, 'goals.form.createError', 'goal'))
      }
    }
    const isDirty = isGoalDraftDirty(draft, initialHabitIds)
    const dismissGuard = useDismissGuard({ isDirty, onDismiss: dismiss })
    return {
      descriptionRef, targetRef, unitRef, dismissGuard,
      ...draft, selectingHabits, setSelectingHabits, focusRequest, fieldErrors, formError,
      isSubmitting: mutation.isPending, isStreak: draft.goalType === 'Streak',
      isDirty, dismiss, onSubmit,
      setDescription: (description: string) => setDraft((current) => ({ ...current, description })),
      setTargetValue: (targetValue: string) => setDraft((current) => ({ ...current, targetValue })),
      setUnit: (unit: string) => setDraft((current) => ({ ...current, unit })),
      setDeadline: (deadline: string) => setDraft((current) => ({ ...current, deadline })),
      setHabitIds: (habitIds: string[]) => setDraft((current) => ({ ...current, habitIds })),
      handleTypeChange: (goalType: GoalType) => setDraft((current) => ({ ...current, goalType, unit: goalType === 'Streak' ? translate('goals.form.streakUnit') : '' })),
    }
  }
}
