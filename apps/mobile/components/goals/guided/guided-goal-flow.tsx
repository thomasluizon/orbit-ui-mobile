import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import type { GoalDismissGuard } from '@orbit/shared/hooks'
import { getGoalFlowStepError, type GoalFlowStep, type GoalFlowStepError } from '@orbit/shared/utils'
import { DiscardChangesSheet } from '@/components/ui/discard-changes-sheet'
import { FlowScreen } from '@/components/ui/flow-screen'
import { QuestionFlow } from '@/components/ui/question-flow'
import type { GoalDraftPort, GoalStepHint } from './goal-flow-steps'
import type { GuidedGoalFlowNavigation } from './use-guided-goal-flow'

export interface SavedGoal { goalId: string; title: string; deadline: string }

/** The hint state of the flow: a step validates its answer and shows the hint of the current form beside the field. */
export function useStepHints(draft: Pick<GoalDraftPort, 'description' | 'targetValue' | 'unit'>, flow: GuidedGoalFlowNavigation) {
  const { t } = useTranslation()
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
export function stepOfField(field: GoalFlowStepError['field']): GoalFlowStep {
  return field === 'description' ? 'what' : 'amount'
}

interface GoalFlowFrameProps {
  flowId: 'goal_create' | 'goal_edit'
  label: string
  flow: GuidedGoalFlowNavigation
  view: FlowStepView
  requestClose: () => void
  discard: GoalDismissGuard
}

export function GoalFlowFrame({ flowId, label, flow, view, requestClose, discard }: Readonly<GoalFlowFrameProps>) {
  const { t } = useTranslation()
  const { position, total } = flow.position
  return (
    <FlowScreen label={label} onDismiss={flow.canGoBack ? flow.back : requestClose}>
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
