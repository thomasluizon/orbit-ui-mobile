'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import { buildGoalUpdateRequest, createGoalEditDraft, getGoalEditError, isGoalEditDirty, type CreateGoalSheetProps, type GoalEditDraft, type GoalEditSource } from '@orbit/shared/hooks'
import type { GoalType } from '@orbit/shared/types/goal'
import { buildGoalTitle, getFriendlyErrorMessage, getGoalFlowStepError, type GoalFlowStep, type GoalFlowStepError } from '@orbit/shared/utils'
import { isStreakGoal } from '@orbit/shared/utils/goal-form'
import { DiscardChangesSheet } from '@/components/ui/discard-changes-sheet'
import { FlowScreen } from '@/components/ui/flow-screen'
import { QuestionFlow } from '@/components/ui/question-flow'
import { useAppToast } from '@/hooks/use-app-toast'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { useGoalCreation } from '@/hooks/use-goal-creation'
import { useUpdateGoal } from '@/hooks/use-goals'
import { captureGuidedFlowCompleted } from '@/lib/posthog'
import { GoalSummary, useAmountView, useDeadlineView, useTrackView, useWhatView, type GoalDraftPort, type GoalStepHint } from './goal-flow-steps'
import { useGoalHabitsSummary, useGoalHabitsView } from './goal-habits-step'
import { GoalResultDialog } from './goal-result-dialog'
import { useGuidedGoalFlow, type GuidedGoalFlowNavigation } from './use-guided-goal-flow'

interface SavedGoal { goalId: string; title: string; deadline: string }

/** The hint state of the flow: a step validates its answer and shows the hint of the current form beside the field. */
function useStepHints(draft: Pick<GoalDraftPort, 'description' | 'targetValue' | 'unit'>, flow: GuidedGoalFlowNavigation) {
  const t = useTranslations()
  const [hint, setHint] = useState<GoalStepHint | null>(null)
  const show = (error: GoalFlowStepError) => setHint((current) => ({ field: error.field, message: t(error.key), request: (current?.request ?? 0) + 1 }))
  const submit = (step: GoalFlowStep) => {
    const error = getGoalFlowStepError(step, draft)
    if (error) { show(error); return }
    setHint(null)
    flow.advance()
  }
  return { hint, show, clear: () => setHint(null), submit }
}

/** The step a field belongs to: a hint on the summary opens that step. */
function stepOfField(field: GoalFlowStepError['field']): GoalFlowStep {
  return field === 'description' ? 'what' : 'amount'
}

interface GoalFlowFrameProps {
  flowId: 'goal_create' | 'goal_edit'
  label: string
  flow: GuidedGoalFlowNavigation
  view: FlowStepView
  requestClose: () => void
  discard: ReturnType<typeof useDismissGuard>
}

function GoalFlowFrame({ flowId, label, flow, view, requestClose, discard }: Readonly<GoalFlowFrameProps>) {
  const t = useTranslations()
  const { position, total } = flow.position
  return (
    <FlowScreen label={label} onDismiss={requestClose}>
      <QuestionFlow
        flow={flowId}
        stepKey={flow.current.step}
        direction={flow.current.direction}
        question={view.question}
        line={view.line}
        position={position}
        total={total}
        progressLabel={t('habits.flow.progress', { position, total })}
        backLabel={t('habits.flow.back')}
        closeLabel={t('habits.flow.close')}
        onBack={flow.canGoBack ? flow.back : undefined}
        onClose={requestClose}
        options={view.options}
        primary={view.primary}
      >
        {view.free}
      </QuestionFlow>
      <DiscardChangesSheet open={discard.showDiscardDialog} onKeepEditing={discard.cancelDismiss} onDiscard={discard.confirmDismiss} />
    </FlowScreen>
  )
}

function GoalCreateRun({ props, onSaved }: Readonly<{ props: CreateGoalSheetProps; onSaved: (goal: SavedGoal) => void }>) {
  const t = useTranslations()
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

interface GuidedGoalEditFlowProps {
  goal: GoalEditSource & { id: string }
  onClose: () => void
}

/** The edit draft as the steps read it. The type of a stored goal is shown, so the port has no way to change it. */
function editPort(goal: GoalEditSource, draft: GoalEditDraft, update: (change: Partial<GoalEditDraft>) => void): GoalDraftPort {
  return {
    goalType: isStreakGoal(goal.type) ? 'Streak' : 'Standard', ...draft,
    setDescription: (description) => update({ description }),
    setTargetValue: (targetValue) => update({ targetValue }),
    setUnit: (unit) => update({ unit }),
    setDeadline: (deadline) => update({ deadline }),
  }
}

function GoalEditRun({ goal, onClose, onSaved }: Readonly<GuidedGoalEditFlowProps & { onSaved: (goal: SavedGoal) => void }>) {
  const t = useTranslations()
  const translate = (key: string, values?: Record<string, string | number | Date>) => t(key, values)
  const updateGoal = useUpdateGoal()
  const flow = useGuidedGoalFlow({ mode: 'edit', fromHabit: false })
  const [formError, setFormError] = useState('')
  const [draft, setDraft] = useState(() => createGoalEditDraft(goal))
  const hints = useStepHints(draft, flow)
  const port = editPort(goal, draft, (change) => { hints.clear(); setDraft((current) => ({ ...current, ...change })) })
  const discard = useDismissGuard({ isDirty: isGoalEditDirty(draft, goal), onDismiss: onClose })
  const save = async () => {
    const error = getGoalEditError(draft)
    const request = buildGoalUpdateRequest(draft)
    if (error || !request) { if (error) { hints.show(error); flow.open(stepOfField(error.field)) } return }
    setFormError('')
    try {
      await updateGoal.mutateAsync({ goalId: goal.id, data: request })
      captureGuidedFlowCompleted('goal_edit', flow.steps.length, false)
      onSaved({ goalId: goal.id, title: request.title, deadline: draft.deadline })
    } catch (failure: unknown) {
      setFormError(getFriendlyErrorMessage(failure, translate, 'goals.errors.update', 'goal'))
    }
  }
  const context = { draft: port, hint: hints.hint, submit: hints.submit, advance: flow.advance }
  const views: Partial<Record<GoalFlowStep, FlowStepView>> = {
    what: useWhatView(context),
    amount: useAmountView(context),
    deadline: useDeadlineView(context),
  }
  const summary: FlowStepView = {
    question: t('habits.flow.confirm.question'),
    line: t('habits.flow.confirm.line'),
    free: <GoalSummary draft={port} mode="edit" error={formError} onOpen={flow.open} />,
    primary: { label: t('common.save'), onPress: () => void save(), loading: updateGoal.isPending },
  }
  const requestClose = () => { if (!updateGoal.isPending) discard.requestDismiss() }
  return <GoalFlowFrame flowId="goal_edit" label={t('goals.detail.edit')} flow={flow} view={views[flow.current.step] ?? summary} requestClose={requestClose} discard={discard} />
}

/** The guided goal edit: it opens on the summary with the stored values, and a save closes with the result dialog. */
export function GuidedGoalEditFlow({ goal, onClose }: Readonly<GuidedGoalEditFlowProps>) {
  const [saved, setSaved] = useState<SavedGoal | null>(null)
  if (!saved) return <GoalEditRun goal={goal} onClose={onClose} onSaved={setSaved} />
  return <GoalResultDialog title={saved.title} deadline={saved.deadline} change="updated" opensGoal onPrimary={onClose} onClose={onClose} />
}
