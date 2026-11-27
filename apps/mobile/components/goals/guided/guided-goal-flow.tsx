import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import type { GoalDismissGuard, GuidedGoalFlowNavigation } from '@orbit/shared/hooks'
import { getGoalFlowStepError, type GoalDraftPort, type GoalFlowStep, type GoalFlowStepError, type GoalStepHint } from '@orbit/shared/utils'
import { DiscardChangesSheet } from '@/components/ui/discard-changes-sheet'
import { FlowScreen } from '@/components/ui/flow-screen'
import { QuestionFlow } from '@/components/ui/question-flow'

export interface SavedGoal { goalId: string; title: string; deadline: string }

/** The hint state of the flow: a step validates its answer and shows the hint of the current form beside the field. */
export function useStepHints(draft: Pick<GoalDraftPort, 'description' | 'targetValue' | 'unit'>, flow: GuidedGoalFlowNavigation, mode: 'create' | 'edit' = 'create') {
  const { t } = useTranslation()
  const [hint, setHint] = useState<GoalStepHint | null>(null)
  const show = (error: GoalFlowStepError) => setHint((current) => ({ field: error.field, message: t(error.key), request: (current?.request ?? 0) + 1 }))
  const submit = (step: GoalFlowStep) => {
    const error = getGoalFlowStepError(step, draft, mode)
    if (error) { show(error); return }
    setHint(null)
    flow.advance()
  }
  return { hint, show, clear: () => setHint(null), submit }
}

interface GoalFlowContentProps {
  flowId: 'goal_create' | 'goal_edit'
  flow: GuidedGoalFlowNavigation
  view: FlowStepView
  requestClose: () => void
  discard: GoalDismissGuard
  dismissRef: GoalFlowDismissRef
}

export type GoalFlowDismissRef = MutableRefObject<(() => void) | null>

/**
 * The question and the discard sheet of a goal flow. The native window around them belongs to the caller, so a flow that
 * starts again swaps this content under one window and never mounts a second Modal while the first one dismisses.
 */
export function GoalFlowContent({ flowId, flow, view, requestClose, discard, dismissRef }: Readonly<GoalFlowContentProps>) {
  const { t } = useTranslation()
  const { position, total } = flow.position
  const dismiss = flow.canGoBack ? flow.back : requestClose
  useEffect(() => {
    dismissRef.current = dismiss
    return () => { dismissRef.current = null }
  })
  return (
    <>
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
        secondary={view.secondary}
      >
        {view.free}
      </QuestionFlow>
      <DiscardChangesSheet open={discard.showDiscardDialog} onKeepEditing={discard.cancelDismiss} onDiscard={discard.confirmDismiss} />
    </>
  )
}

interface GoalFlowWindowProps {
  label: string
  open?: boolean
  onDismissed?: () => void
  dismissRef: GoalFlowDismissRef
  result?: ReactNode
  children: ReactNode
}

/** The one native window of a goal flow. The content inside it reports its close action through `dismissRef`. */
export function GoalFlowWindow({ label, open, onDismissed, dismissRef, result, children }: Readonly<GoalFlowWindowProps>) {
  return <FlowScreen label={label} open={open} onDismissed={onDismissed} onDismiss={() => dismissRef.current?.()} result={result}>{children}</FlowScreen>
}

interface GoalFlowFrameProps extends Omit<GoalFlowContentProps, 'dismissRef'>, Pick<GoalFlowWindowProps, 'open' | 'onDismissed'> {
  label: string
  result?: ReactNode
}

/** A goal flow that owns its window and never starts again in place. */
export function GoalFlowFrame({ label, open, onDismissed, result, ...content }: Readonly<GoalFlowFrameProps>) {
  const dismissRef: GoalFlowDismissRef = useRef(null)
  return <GoalFlowWindow label={label} open={open} onDismissed={onDismissed} dismissRef={dismissRef} result={result}><GoalFlowContent {...content} dismissRef={dismissRef} /></GoalFlowWindow>
}
