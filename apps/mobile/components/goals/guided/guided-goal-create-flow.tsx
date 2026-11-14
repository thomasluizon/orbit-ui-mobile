import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import type { CreateGoalSheetProps } from '@orbit/shared/hooks'
import type { GoalType } from '@orbit/shared/types/goal'
import { buildGoalTitle, getGoalFlowStepError, type GoalFlowStep } from '@orbit/shared/utils'
import { useAppToast } from '@/hooks/use-app-toast'
import { useGoalCreation } from '@/hooks/use-goal-creation'
import { captureGuidedFlowCompleted } from '@/lib/posthog'
import { GoalSummary, useAmountView, useDeadlineView, useTrackView, useWhatView, type GoalDraftPort } from './goal-flow-steps'
import { useGoalHabitsSummary, useGoalHabitsView } from './goal-habits-step'
import { GoalResultDialog } from './goal-result-dialog'
import { GoalFlowFrame, stepOfField, useStepHints, type SavedGoal } from './guided-goal-flow'
import { useGuidedGoalFlow } from './use-guided-goal-flow'

function GoalCreateRun({ props, onSaved }: Readonly<{ props: CreateGoalSheetProps; onSaved: (goal: SavedGoal) => void }>) {
  const { t } = useTranslation()
  const { showError } = useAppToast()
  const submitted = useRef<Omit<SavedGoal, 'goalId'>>({ title: '', deadline: '' })
  const saved = useRef<SavedGoal | null>(null)
  const fromHabit = Boolean(props.fromHabit) || (props.initialHabitIds?.length ?? 0) > 0
  const flow = useGuidedGoalFlow({ mode: 'create', fromHabit })
  const form = useGoalCreation({
    open: true, initialHabitIds: props.initialHabitIds, translate: t, showError,
    closeSheet: (finish) => finish(),
    onCreated: (goalId, habitIds) => {
      saved.current = { goalId, ...submitted.current }
      captureGuidedFlowCompleted('goal_create', flow.steps.length, false)
      props.onCreated?.(goalId, habitIds)
    },
    onClose: () => { if (saved.current) onSaved(saved.current); else props.onClose() },
  })
  const hints = useStepHints(form, flow)
  const draft: GoalDraftPort = {
    goalType: form.goalType, description: form.description, targetValue: form.targetValue, unit: form.unit, deadline: form.deadline,
    setDescription: (value) => { hints.clear(); form.setDescription(value) },
    setTargetValue: (value) => { hints.clear(); form.setTargetValue(value) },
    setUnit: (value) => { hints.clear(); form.setUnit(value) },
    setDeadline: form.setDeadline,
    chooseType: (type: GoalType) => { if (type !== form.goalType) form.handleTypeChange(type) },
  }
  const context = { draft, hint: hints.hint, submit: hints.submit, advance: flow.advance }
  const create = () => {
    const error = getGoalFlowStepError('what', form) ?? getGoalFlowStepError('amount', form)
    if (error) { hints.show(error); flow.open(stepOfField(error.field)); return }
    submitted.current = { title: buildGoalTitle(form.description, form.targetValue, form.unit), deadline: form.deadline }
    void form.onSubmit()
  }
  const serverError = form.formError || Object.values(form.fieldErrors)[0]
  const habitsValue = useGoalHabitsSummary(form.habitIds, props.fromHabit)
  const views: Record<GoalFlowStep, FlowStepView> = {
    what: useWhatView(context),
    track: useTrackView(context),
    amount: useAmountView(context),
    deadline: useDeadlineView(context),
    habits: useGoalHabitsView({ selectedIds: form.habitIds, goalType: form.goalType, onChange: form.setHabitIds, onContinue: flow.advance }),
    summary: {
      question: t('habits.flow.confirm.question'),
      line: t('habits.flow.confirm.line'),
      free: <GoalSummary draft={draft} mode="create" habitsValue={habitsValue} habitsEditable={!fromHabit} error={serverError} onOpen={flow.open} />,
      primary: { label: t('goals.create'), onPress: create, loading: form.isSubmitting },
    },
  }
  const requestClose = () => { if (!form.isSubmitting) form.dismissGuard.requestDismiss() }
  return <GoalFlowFrame flowId="goal_create" label={t('goals.create')} flow={flow} view={views[flow.current.step]} requestClose={requestClose} discard={form.dismissGuard} />
}

/** The guided goal create flow: one question at a time over the draft the current sheet owns, closed by the result dialog. */
export function GuidedGoalCreateFlow(props: Readonly<CreateGoalSheetProps>) {
  const [run, setRun] = useState(0)
  const [saved, setSaved] = useState<SavedGoal | null>(null)
  if (!saved) return <GoalCreateRun key={run} props={props} onSaved={setSaved} />
  const { onOpenGoal } = props
  return (
    <GoalResultDialog
      title={saved.title}
      deadline={saved.deadline}
      change="created"
      opensGoal={Boolean(onOpenGoal)}
      onPrimary={() => { props.onClose(); onOpenGoal?.(saved.goalId) }}
      onCreateAnother={() => { setSaved(null); setRun((current) => current + 1) }}
      onClose={props.onClose}
    />
  )
}
