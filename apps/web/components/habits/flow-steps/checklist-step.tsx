'use client'

import { useTranslations } from 'next-intl'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import type { ChecklistItem } from '@orbit/shared/types/habit'
import { HabitChecklist } from '@/components/habits/habit-checklist'
import { OptionCard } from '@/components/ui/option-card'
import { PillButton } from '@/components/ui/pill-button'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useSaveTemplateView, useTemplateQuestionView } from './template-step'

export interface ChecklistStepProps {
  items: ChecklistItem[]
  onItemsChange: (items: ChecklistItem[]) => void
  proposedItemCount?: number
  pendingItemText?: string
  onPendingItemChange?: (text: string) => void
  /** Leaves the step: the host returns to the summary or the list of optional questions. */
  onContinue: () => void
}

type ChecklistQuestion = 'items' | 'templates' | 'save'

/** The checklist step "Tem passos dentro disso?". The template question and the save question are questions inside it, with their own `stepKey` and back. */
export function useChecklistStepView(props: Readonly<ChecklistStepProps>): FlowStepView {
  const { items, onItemsChange, onContinue } = props
  const t = useTranslations()
  const [question, setQuestion] = useAccountScopedState<ChecklistQuestion>('items')
  const toItems = () => setQuestion('items')
  const templates = useTemplateQuestionView({ onLoad: (loaded) => { onItemsChange(loaded); toItems() }, onWrite: toItems })
  const save = useSaveTemplateView({ items, onSaved: toItems })
  if (question === 'templates') return { ...templates, stepKey: 'templates', onBack: toItems }
  if (question === 'save') return { ...save, stepKey: 'save', onBack: toItems }
  const hasItems = items.length > 0
  return {
    question: t('habits.flow.optional.checklist'),
    line: t('habits.flow.checklist.line'),
    options: <>
      <OptionCard label={t('habits.flow.optional.no')} disabled={hasItems} disabledReason={t('habits.flow.checklist.noWithItems')} onSelect={onContinue} />
      <OptionCard label={t('habits.flow.checklist.useTemplate')} onSelect={() => setQuestion('templates')} />
    </>,
    free: <>
      <HabitChecklist editable items={items} proposedItemCount={props.proposedItemCount} onItemsChange={onItemsChange}
        pendingItemText={props.pendingItemText} onPendingItemChange={props.onPendingItemChange} />
      {hasItems ? <div className="flex justify-center"><PillButton variant="ghost" size="sm" onClick={() => setQuestion('save')}>{t('habits.form.saveAsTemplate')}</PillButton></div> : null}
    </>,
    primary: { label: t('habits.flow.continue'), onPress: onContinue },
  }
}
