'use client'

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { useGoalProgressEntry } from '@/hooks/use-goal-progress-entry'
import type { Goal } from '@orbit/shared/types/goal'
import { Input } from '@/components/ui/input'
import { PillButton } from '@/components/ui/pill-button'
import { ActionRow } from '@/components/ui/action-row'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { DiscardChangesSheet } from '@/components/ui/discard-changes-sheet'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import { useUpdateGoalProgress } from '@/hooks/use-goals'
import { Check } from '@/components/ui/icons'

interface GoalProgressFormProps {
  goal: Goal
  refetchDetail: () => Promise<unknown>
  onClose: () => void
}

export function GoalProgressForm({ goal, refetchDetail, onClose }: Readonly<GoalProgressFormProps>) {
  const t = useTranslations()
  const formId = useId()
  const update = useUpdateGoalProgress()
  const entry = useGoalProgressEntry(goal.currentValue, goal.targetValue, request => update.mutateAsync({
    goalId: goal.id, data: request, goalName: goal.title, goalCount: goal.targetValue, goalUnit: goal.unit,
  }), refetchDetail)
  const { busy } = entry
  const error = entry.failure ? getFriendlyErrorMessage(entry.failure, t, 'goals.errors.progress', 'goalProgress') : ''
  const { sheetRef, closeSheet } = useSheetHost()
  const dismiss = useDismissGuard({ isDirty: entry.isDirty, onDismiss: () => closeSheet(onClose) })
  const requestDismiss = () => { if (!busy) dismiss.requestDismiss() }

  async function submit() {
    if (busy) return
    if (await entry.submit()) closeSheet(onClose)
  }

  return <>
    <Sheet ref={sheetRef} open title={t('goals.updateProgress')} onClose={!busy && dismiss.canDismiss ? onClose : undefined} onAttemptDismiss={requestDismiss} actions={
      <ActionRow>
        <PillButton variant="ghost" accessibleName={t('common.cancel')} disabled={busy} onClick={requestDismiss}>{t('common.cancel')}</PillButton>
        <PillButton accessibleName={t('common.save')} disabled={busy} loading={busy} formId={formId} leadingIcon={<Check size={16} aria-hidden="true" />}>{t('common.save')}</PillButton>
      </ActionRow>
    }>
      <form id={formId} noValidate onSubmit={event => { event.preventDefault(); void submit() }} className="flex flex-col gap-6" aria-busy={busy}>
        <Input label={t('goals.progress')} name="currentValue" value={entry.value} onChange={entry.setValue} required inputMode="decimal" autoComplete="off" disabled={busy} focusRequest={entry.focusRequest} error={entry.errorKey ? t(entry.errorKey) : undefined} hint={entry.exceedsTarget ? t('goals.form.progressExceedsTarget') : undefined} />
        <Input label={t('goals.progressNote')} name="progressNote" value={entry.note} onChange={entry.setNote} autoComplete="off" disabled={busy} focusRequest={entry.noteFocusRequest} error={entry.noteErrorKey ? t(entry.noteErrorKey) : undefined} multiline rows={3} />
        <p role="alert" className={error ? 'text-sm text-[var(--fg-2)]' : 'sr-only'}>{error}</p>
      </form>
    </Sheet>
    <DiscardChangesSheet open={dismiss.showDiscardDialog} onKeepEditing={dismiss.cancelDismiss} onDiscard={dismiss.confirmDismiss} />
  </>
}
