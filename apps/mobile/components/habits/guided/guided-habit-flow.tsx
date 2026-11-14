import { useTranslation } from 'react-i18next'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import { QuestionFlow } from '@/components/ui/question-flow'
import { useDetailViews } from './guided-detail-views'
import {
  usePhraseView,
  useReminderView,
  useSummaryView,
  useTimeView,
  useTypeView,
  useWhenView,
  type GuidedHabitFlowProps,
} from './guided-step-views'
import { useGuidedHabitFlow } from './use-guided-habit-flow'

export type { GuidedHabitCompletion, GuidedHabitFields, GuidedHabitFlowProps } from './guided-step-views'

/** The guided create and edit flow. It renders one question at a time over the form state the modal owns. */
export function GuidedHabitFlow(props: Readonly<GuidedHabitFlowProps>) {
  const { formHelpers, fields, mode = 'create' } = props
  const { t } = useTranslation()
  const flow = useGuidedHabitFlow({ formHelpers, lockedGeneral: props.lockedGeneral, mode, onReminderEnabledChange: fields.onReminderEnabledChange, onSlipAlertEnabledChange: fields.onSlipAlertEnabledChange })
  const input = { flow, formHelpers }
  const views: Partial<Record<string, FlowStepView>> = {
    what: usePhraseView(input),
    when: useWhenView(input),
    time: useTimeView(input),
    reminder: useReminderView(input),
    type: useTypeView({ ...input, lockedGeneral: props.lockedGeneral }),
    summary: useSummaryView({ ...input, props }),
    ...useDetailViews({ ...input, fields }),
  }
  const step = flow.current.step
  const view = views[step] ?? views.summary!
  const firstStep = mode === 'create' ? 'what' : 'summary'
  const hostBack = step === firstStep ? undefined : () => { flow.back() }
  return (
    <QuestionFlow
      flow={mode === 'create' ? 'habit_create' : 'habit_edit'}
      stepKey={view.stepKey ?? step}
      direction={flow.current.direction}
      question={view.question}
      line={view.line}
      lineKey={view.lineKey}
      position={flow.position.position}
      total={flow.position.total}
      progressLabel={t('habits.flow.progress', { position: flow.position.position, total: flow.position.total })}
      backLabel={t('habits.flow.back')}
      closeLabel={t('habits.flow.close')}
      onBack={view.onBack ?? hostBack}
      onClose={props.onClose}
      orbitState={view.orbitState ?? (flow.reading ? 'pensando' : 'parado')}
      statusText={view.statusText ?? (flow.reading ? t('habits.flow.what.reading') : undefined)}
      options={view.options}
      primary={view.primary}
    >
      {view.free}
    </QuestionFlow>
  )
}
