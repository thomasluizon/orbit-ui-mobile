'use client'

import { useCallback, useEffect, useRef, type MouseEvent } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { formatLocaleDateTime, getFriendlyErrorMessage } from '@orbit/shared/utils'
import { prepareChatRequest } from '@orbit/shared/stores'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { ListRow } from '@/components/ui/list-row'
import { AppBar } from '@/components/ui/app-bar'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppToast } from '@/hooks/use-app-toast'
import { useGoals, useGoalDetail, useDeleteGoal } from '@/hooks/use-goals'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { EditGoalModal } from './edit-goal-modal'
import { GoalForecast } from './goal-detail-drawer/goal-forecast'
import { GoalActionFooter } from './goal-detail-drawer/goal-action-footer'
import { GoalDetailCollections } from './goal-detail-drawer/goal-detail-collections'
import { GoalLoadError } from './goal-detail-drawer/goal-load-error'
import { GoalProgressForm } from './goal-detail-drawer/goal-progress-form'
import { GoalProgressBlock } from './goal-detail-drawer/goal-progress-block'
import { useGoalStatusActions } from './goal-detail-drawer/use-goal-status-actions'
import { useGoalDrawerInitialAction, type GoalDrawerInitialAction } from './goal-detail-drawer/use-goal-drawer-initial-action'
export type { GoalDrawerInitialAction } from './goal-detail-drawer/use-goal-drawer-initial-action'

interface GoalDetailDrawerProps {
  open: boolean
  inline?: boolean
  goalId: string
  onOpenChange: (open: boolean) => void
  onLinkedHabitNavigate?: (habitId: string) => void
  initialAction?: GoalDrawerInitialAction | null
}

export function GoalDetailDrawer({ open, inline = false, goalId, onOpenChange, onLinkedHabitNavigate, initialAction }: Readonly<GoalDetailDrawerProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const contentRef = useRef<HTMLDivElement>(null)
  const barHeadingRef = useRef<HTMLHeadingElement>(null)
  const { showError } = useAppToast()
  const { data: goalsData } = useGoals()
  const { data: detailData, isLoading, isError, refetch } = useGoalDetail(open ? goalId : null)
  const goal = detailData?.goal ?? goalsData?.goalsById.get(goalId) ?? null
  const draftHydrated = useChatStore(state => state.draftHydrated)
  const deleteGoal = useDeleteGoal()
  const [editing, setEditing] = useAccountScopedState(false)
  const [editingProgress, setEditingProgress] = useAccountScopedState(false)
  const [deleting, setDeleting] = useAccountScopedState(false)
  const { sheetRef, closeSheet } = useSheetHost()
  const onClose = useCallback(() => onOpenChange(false), [onOpenChange])
  const close = useCallback((exitAction?: () => void) => {
    const finish = () => {
      onClose()
      exitAction?.()
    }
    if (inline) finish()
    else closeSheet(finish)
  }, [inline, closeSheet, onClose])
  const openProgressForm = useCallback(() => {
    if (!goal || goal.status !== 'Active' || goal.isProgressDerived) return
    if (inline) setEditingProgress(true)
    else closeSheet(() => setEditingProgress(true))
  }, [goal, inline, closeSheet, setEditingProgress])
  const openLinkedHabit = useCallback((habitId: string, event: MouseEvent<HTMLElement>) => {
    if (!onLinkedHabitNavigate || event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return

    event.preventDefault()
    const navigate = () => onLinkedHabitNavigate(habitId)
    if (inline) navigate()
    else close(navigate)
  }, [inline, close, onLinkedHabitNavigate])
  const actions = useGoalStatusActions({
    goalId,
    goalName: goal?.title,
    goalCount: goal?.targetValue,
    goalUnit: goal?.unit,
    refetchDetail: refetch,
  })
  const formatDate = (date: string) => formatLocaleDateTime(date, locale, { month: 'short', day: 'numeric' })

  const openAstra = () => {
    if (!goal || !draftHydrated) return
    const request = {
      id: `goal-detail:${goal.id}`,
      label: t('nav.astra'),
      prompt: t('goals.detail.askAstraSeedDefault', { title: goal.title }),
    }
    const openConversation = () => {
      prepareChatRequest(useChatStore.getState(), request)
      useUIStore.getState().setAstraConversationOpen(true)
    }
    if (inline) openConversation()
    else close(openConversation)
  }

  async function confirmDelete() {
    try {
      await deleteGoal.mutateAsync(goalId)
      close()
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, t, 'goals.errors.delete', 'goal'))
    }
  }

  useGoalDrawerInitialAction({ open, initialAction: goal ? initialAction : null, openEditModal: () => setEditing(true), openDeleteConfirm: () => setDeleting(true), openProgressForm })

  useEffect(() => {
    if (!open || !inline) return
    const trigger = document.activeElement
    const target = contentRef.current?.querySelector<HTMLHeadingElement>('h1') ?? barHeadingRef.current
    target?.focus()
    return () => {
      requestAnimationFrame(() => {
        if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus()
      })
    }
  }, [open, inline])

  useEffect(() => {
    if (!open || !inline || !goal) return
    if (document.activeElement === contentRef.current || document.activeElement === document.body) {
      contentRef.current?.querySelector<HTMLHeadingElement>('h1')?.focus({ preventScroll: true })
    }
  }, [goal, inline, open])

  const body = (
    <div ref={contentRef} tabIndex={inline ? -1 : undefined} data-goal-detail className="flex flex-col gap-6">
      {goal ? <>
        <GoalProgressBlock key={`progress-${goalId}`} goal={{ ...goal, trackingStatus: detailData?.metrics.trackingStatus ?? goal.trackingStatus }} isUpdatingStatus={actions.isUpdatingStatus} onEditProgress={openProgressForm} onComplete={() => void actions.markCompleted()} refetchDetail={refetch} />
        <GoalForecast metrics={detailData?.metrics ?? null} unit={goal.unit} isLoading={isLoading} />
        <GoalDetailCollections key={`collections-${goalId}`} linkedHabits={goal.linkedHabits} habitAdherence={detailData?.metrics.habitAdherence ?? []} entries={detailData?.goal.progressHistory ?? []} target={goal.targetValue} unit={goal.unit} formatDate={formatDate} onLinkedHabitNavigate={openLinkedHabit} />
        <ListRow placement="column" title={t('nav.astra')} titleTranslate="no" accessibilityLabel={`${t('goals.detail.askAstraEyebrow')}: ${t('goals.detail.askAstraDefault')}`} disabled={!draftHydrated} onClick={openAstra} />
        <GoalActionFooter isActive={goal.status === 'Active'} isAbandoned={goal.status === 'Abandoned'} isUpdatingStatus={actions.isUpdatingStatus} onMarkAbandoned={() => void actions.markAbandoned()} onReactivate={() => void actions.reactivate()} onEdit={() => setEditing(true)} onDelete={() => setDeleting(true)} />
      </> : isLoading ? <Skeleton variant="settings" label={t('progressScreen.loading')} /> : null}
      {isError ? <GoalLoadError onRetry={() => void refetch()} /> : null}
    </div>
  )

  return (
    <>
      {open && (inline || !editingProgress) ? inline ? <><AppBar title={t('progressScreen.sections.goals')} titleIsHeading={!goal} titleRef={barHeadingRef} onBack={() => close()} backLabel={t('common.back')} />{body}</> : <Sheet ref={sheetRef} open onClose={onClose} title={t('progressScreen.sections.goals')}>{body}</Sheet> : null}
      {open && editingProgress && goal ? <GoalProgressForm key={goalId} goal={goal} refetchDetail={refetch} onClose={() => setEditingProgress(false)} /> : null}
      {goal ? <EditGoalModal open={editing} onOpenChange={setEditing} goal={goal} /> : null}
      <ConfirmSheet open={deleting} title={t('goals.detail.delete')} message={t('goals.detail.deleteNamed', { title: goal?.title ?? '' })} confirmLabel={t('goals.detail.delete')} destructive onCancel={() => setDeleting(false)} onConfirm={() => { setDeleting(false); void confirmDelete() }} />
    </>
  )
}
