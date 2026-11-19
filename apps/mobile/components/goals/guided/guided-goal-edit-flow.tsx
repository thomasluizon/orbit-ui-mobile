import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import { buildGoalUpdateRequest, createGoalEditDraft, getGoalEditError, isGoalEditDirty, type GoalEditSource } from '@orbit/shared/hooks'
import { createGoalEditPort, getFriendlyErrorMessage, goalFlowStepOfField, type GoalFlowStep } from '@orbit/shared/utils'
import { useBackendFieldErrors } from '@/hooks/use-backend-field-errors'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { useUpdateGoal } from '@/hooks/use-goals'
import { useSubmitHold } from '@/hooks/use-submit-hold'
import { captureGuidedFlowCompleted } from '@/lib/posthog'
import { GoalSummary, useAmountView, useDeadlineView, useWhatView } from './goal-flow-steps'
import { GoalResultDialog } from './goal-result-dialog'
import { GoalFlowFrame, useStepHints, type SavedGoal } from './guided-goal-flow'
import { useGuidedGoalFlow } from './use-guided-goal-flow'

interface GuidedGoalEditFlowProps {
  goal: GoalEditSource & { id: string }
  onClose: () => void
}

function GoalEditRun({ goal, onClose, onSaved, result }: Readonly<GuidedGoalEditFlowProps & { onSaved: (goal: SavedGoal) => void; result: ReactNode }>) {
  const { t } = useTranslation()
  const translate = (key: string, values?: Record<string, unknown>) => t(key, values)
  const updateGoal = useUpdateGoal()
  const submission = useSubmitHold()
  const flow = useGuidedGoalFlow({ mode: 'edit', fromHabit: false })
  const [formError, setFormError] = useState('')
  const [draft, setDraft] = useState(() => createGoalEditDraft(goal))
  const hints = useStepHints(draft, flow, 'edit')
  const backendErrors = useBackendFieldErrors({ description: draft.description, targetValue: draft.targetValue, unit: draft.unit }, { description: 'Title', targetValue: 'TargetValue', unit: 'Unit' })
  const port = createGoalEditPort(goal, draft, (change) => { hints.clear(); setDraft((current) => ({ ...current, ...change })) })
  const discard = useDismissGuard({ isDirty: isGoalEditDirty(draft, goal), onDismiss: onClose })
  const save = () => submission.run(async (startRequest) => {
    const error = getGoalEditError(draft)
    const request = buildGoalUpdateRequest(draft)
    if (error || !request) { if (error) { hints.show(error); flow.open(goalFlowStepOfField(error.field)) } return 'stay' }
    setFormError('')
    startRequest()
    try {
      await updateGoal.mutateAsync({ goalId: goal.id, data: request })
      captureGuidedFlowCompleted('goal_edit', flow.steps.length, false)
      onSaved({ goalId: goal.id, title: request.title, deadline: draft.deadline })
      return 'leave'
    } catch (failure: unknown) {
      if (!backendErrors.reportBackendErrors(failure).handled) setFormError(getFriendlyErrorMessage(failure, translate, 'goals.errors.update', 'goal'))
      return 'stay'
    }
  })
  const context = { draft: port, hint: hints.hint, submit: hints.submit, advance: flow.advance, deadlineAnswered: true }
  const views: Partial<Record<GoalFlowStep, FlowStepView>> = {
    what: useWhatView(context),
    amount: useAmountView(context),
    deadline: useDeadlineView(context),
  }
  const summary: FlowStepView = {
    question: t('habits.flow.confirm.question'),
    line: t('habits.flow.confirm.line'),
    free: <GoalSummary draft={port} mode="edit" error={formError || Object.values(backendErrors.fieldErrors)[0]} onOpen={flow.open} />,
    primary: { label: t('common.save'), onPress: () => void save(), loading: submission.waiting },
  }
  const requestClose = () => { if (!submission.isRunning()) discard.requestDismiss() }
  return <GoalFlowFrame flowId="goal_edit" label={t('goals.detail.edit')} flow={flow} view={views[flow.current.step] ?? summary} requestClose={requestClose} discard={discard} result={result} />
}

/** The guided goal edit: it opens on the summary with the stored values, and a save closes with the result dialog. */
export function GuidedGoalEditFlow({ goal, onClose }: Readonly<GuidedGoalEditFlowProps>) {
  const [saved, setSaved] = useState<SavedGoal | null>(null)
  const result = saved ? <GoalResultDialog title={saved.title} deadline={saved.deadline} change="updated" opensGoal onPrimary={onClose} onClose={onClose} /> : null
  return <GoalEditRun goal={goal} onClose={onClose} onSaved={setSaved} result={result} />
}
