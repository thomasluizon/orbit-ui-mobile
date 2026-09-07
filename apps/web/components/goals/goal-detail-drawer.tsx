'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { formatLocaleDateTime, getFriendlyErrorMessage } from '@orbit/shared/utils'
import { AppBar } from '@/components/ui/app-bar'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppToast } from '@/hooks/use-app-toast'
import { useGoals, useGoalDetail, useDeleteGoal } from '@/hooks/use-goals'
import { EditGoalModal } from './edit-goal-modal'
import { GoalActionFooter } from './goal-detail-drawer/goal-action-footer'
import { GoalDetailCollections } from './goal-detail-drawer/goal-detail-collections'
import { GoalLoadError } from './goal-detail-drawer/goal-load-error'
import { GoalProgressBlock } from './goal-detail-drawer/goal-progress-block'
import { useGoalStatusActions } from './goal-detail-drawer/use-goal-status-actions'
import { useGoalDrawerInitialAction, type GoalDrawerInitialAction } from './goal-detail-drawer/use-goal-drawer-initial-action'
export type { GoalDrawerInitialAction } from './goal-detail-drawer/use-goal-drawer-initial-action'

interface GoalDetailDrawerProps {
  open: boolean
  inline?: boolean
  goalId: string
  onOpenChange: (open: boolean) => void
  initialAction?: GoalDrawerInitialAction | null
}

export function GoalDetailDrawer({ open, inline = false, goalId, onOpenChange, initialAction }: Readonly<GoalDetailDrawerProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const contentRef = useRef<HTMLDivElement>(null)
  const { showError } = useAppToast()
  const { data: goalsData } = useGoals()
  const { data: detailData, isLoading, isError, refetch } = useGoalDetail(open ? goalId : null)
  const goal = detailData?.goal ?? goalsData?.goalsById.get(goalId) ?? null
  const deleteGoal = useDeleteGoal()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { sheetRef, closeSheet } = useSheetHost()
  const onClose = useCallback(() => onOpenChange(false), [onOpenChange])
  const close = useCallback(() => {
    if (inline) onClose()
    else closeSheet(onClose)
  }, [inline, closeSheet, onClose])
  const actions = useGoalStatusActions({ goalId, goalName: goal?.title, refetchDetail: refetch })
  const formatDate = (date: string) => formatLocaleDateTime(date, locale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit' })

  async function confirmDelete() {
    try {
      await deleteGoal.mutateAsync(goalId)
      close()
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, t, 'goals.errors.delete', 'goal'))
    }
  }

  useGoalDrawerInitialAction({ open, initialAction, openEditModal: () => setEditing(true), openDeleteConfirm: () => setDeleting(true), openProgressForm: () => contentRef.current?.querySelector<HTMLButtonElement>('button')?.focus(), markCompleted: actions.markCompleted })

  useEffect(() => {
    if (!open || !inline) return
    const trigger = document.activeElement
    contentRef.current?.focus()
    return () => {
      requestAnimationFrame(() => {
        if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus()
      })
    }
  }, [open, inline])

  const body = (
    <div ref={contentRef} tabIndex={inline ? -1 : undefined} data-goal-detail className="flex flex-col gap-6">
      {goal ? <>
        <GoalProgressBlock key={`progress-${goalId}`} goal={{ ...goal, trackingStatus: detailData?.metrics.trackingStatus ?? goal.trackingStatus }} isUpdatingStatus={actions.isUpdatingStatus} onComplete={() => void actions.markCompleted()} refetchDetail={refetch} />
        <GoalDetailCollections key={`collections-${goalId}`} linkedHabits={goal.linkedHabits} entries={detailData?.goal.progressHistory ?? []} unit={goal.unit} formatDate={formatDate} />
        <GoalActionFooter isActive={goal.status === 'Active'} isAbandoned={goal.status === 'Abandoned'} isUpdatingStatus={actions.isUpdatingStatus} onMarkAbandoned={() => void actions.markAbandoned()} onReactivate={() => void actions.reactivate()} onEdit={() => setEditing(true)} onDelete={() => setDeleting(true)} />
      </> : isLoading ? <Skeleton variant="settings" label={t('progressScreen.loading')} /> : null}
      {isError ? <GoalLoadError onRetry={() => void refetch()} /> : null}
    </div>
  )

  return (
    <>
      {open ? inline ? <><AppBar title={t('progressScreen.sections.goals')} onBack={close} backLabel={t('common.back')} />{body}</> : <Sheet ref={sheetRef} open onClose={onClose} title={t('progressScreen.sections.goals')}>{body}</Sheet> : null}
      {goal ? <EditGoalModal open={editing} onOpenChange={setEditing} goal={goal} /> : null}
      <ConfirmSheet open={deleting} title={t('goals.detail.delete')} message={t('goals.detail.deleteNamed', { title: goal?.title ?? '' })} confirmLabel={t('goals.detail.delete')} destructive onCancel={() => setDeleting(false)} onConfirm={() => { setDeleting(false); void confirmDelete() }} />
    </>
  )
}
