'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import { buildGoalUpdateRequest, createGoalEditDraft, getGoalEditError, isGoalEditDirty, type GoalEditDraft, type GoalEditSource } from '@orbit/shared/hooks'
import { getFriendlyErrorMessage, type GoalFlowStep } from '@orbit/shared/utils'
import { isStreakGoal } from '@orbit/shared/utils/goal-form'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { useUpdateGoal } from '@/hooks/use-goals'
import { captureGuidedFlowCompleted } from '@/lib/posthog'
import { GoalSummary, useAmountView, useDeadlineView, useWhatView, type GoalDraftPort } from './goal-flow-steps'
import { GoalResultDialog } from './goal-result-dialog'
import { GoalFlowFrame, stepOfField, useStepHints, type SavedGoal } from './guided-goal-flow'
import { useGuidedGoalFlow } from './use-guided-goal-flow'

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
