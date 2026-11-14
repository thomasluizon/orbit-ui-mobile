import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatNavigation } from '@/hooks/use-chat-navigation'
import { AccessibilityInfo, BackHandler, StyleSheet, View } from 'react-native'
import { formatLocaleDateTime, getFriendlyErrorMessage } from '@orbit/shared/utils'
import { prepareChatRequest } from '@orbit/shared/stores'
import { createUseRetainedGoal } from '@orbit/shared/hooks'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { AppBar } from '@/components/ui/app-bar'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppToast } from '@/hooks/use-app-toast'
import { useFlag } from '@/hooks/use-flag'
import { usePrefersReducedMotion } from '@/lib/motion'
import { useGoals, useGoalDetail, useDeleteGoal } from '@/hooks/use-goals'
import { EditGoalModal } from './edit-goal-modal'
import { GoalForecast } from './goal-detail-drawer/goal-forecast'
import { GoalActionFooter } from './goal-detail-drawer/goal-action-footer'
import { GoalDetailCollections } from './goal-detail-drawer/goal-detail-collections'
import { InlineLoadError } from '@/components/ui/inline-load-error'
import { GoalProgressForm } from './goal-detail-drawer/goal-progress-form'
import { GoalProgressBlock } from './goal-detail-drawer/goal-progress-block'
import { useGoalStatusActions } from './goal-detail-drawer/use-goal-status-actions'
import { GoalAskEntry, useGoalOrbitLine } from './goal-detail-drawer/goal-orbit-line'
import { GoalStatusResultDialog } from './goal-detail-drawer/goal-status-result-dialog'
import { useGoalDetailOutcomes } from './goal-detail-drawer/use-goal-detail-outcomes'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface GoalDetailDrawerProps {
  open: boolean
  inline?: boolean
  goalId: string
  onClose: () => void
}

const useRetainedGoal = createUseRetainedGoal(useState)

export function GoalDetailDrawer({ open, inline = false, goalId, onClose }: Readonly<GoalDetailDrawerProps>) {
  const { t, i18n } = useTranslation()
  const navigate = useChatNavigation()
  const locale = i18n.language
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { showError } = useAppToast()
  const { data: goalsData } = useGoals()
  const { data: detailData, isLoading, isError, refetch } = useGoalDetail(open ? goalId : null)
  const goal = detailData?.goal ?? goalsData?.goalsById.get(goalId) ?? null
  const sheetGoal = useRetainedGoal(goal, goalId)
  const astraConversationOpen = useUIStore(state => state.astraConversationOpen)
  const draftHydrated = useChatStore(state => state.draftHydrated)
  const guided = useFlag('orbit_guided_flows')
  const outcomes = useGoalDetailOutcomes(goal, guided, usePrefersReducedMotion())
  const { progressFormOpened } = outcomes
  const orbitLine = useGoalOrbitLine(goal, guided)
  const deleteGoal = useDeleteGoal({ onDeleted: outcomes.onDeleted })
  const [editing, setEditing] = useState(false)
  const [editingProgress, setEditingProgress] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const headingRef = useRef<View>(null)
  const focusedInlineGoalId = useRef<string | null>(null)
  const { sheetRef, closeSheet } = useSheetHost()
  const close = useCallback(() => {
    if (inline) onClose()
    else closeSheet(onClose)
  }, [inline, closeSheet, onClose])
  const openProgressForm = useCallback(() => {
    if (!goal || goal.status !== 'Active' || goal.isProgressDerived) return
    progressFormOpened()
    if (inline) setEditingProgress(true)
    else closeSheet(() => setEditingProgress(true))
  }, [goal, inline, closeSheet, progressFormOpened, setEditingProgress])
  const openHabit = useCallback((habitId: string) => {
    const openDestination = () => navigate({ pathname: '/habits/[id]', params: { id: habitId } })
    if (inline) openDestination()
    else closeSheet(() => { onClose(); openDestination() })
  }, [inline, closeSheet, onClose, navigate])
  const actions = useGoalStatusActions({
    goalId,
    goalName: goal?.title,
    goalCount: goal?.targetValue,
    goalUnit: goal?.unit,
    refetchDetail: () => void refetch(),
    onStatusSaved: outcomes.onStatusSaved,
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
    else closeSheet(() => { onClose(); openConversation() })
  }

  const openGoalsList = () => {
    outcomes.clearResult()
    if (inline) onClose()
    else closeSheet(() => { onClose(); navigate('/progress/goals') })
  }

  async function confirmDelete() {
    outcomes.rememberDeletedTitle()
    try {
      await deleteGoal.mutateAsync(goalId)
      if (!guided) close()
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, t, 'goals.errors.delete', 'goal'))
    }
  }

  useEffect(() => {
    if (!open || !inline || editing || deleting || editingProgress || astraConversationOpen) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true })
    return () => subscription.remove()
  }, [open, inline, editing, deleting, editingProgress, astraConversationOpen, close])

  useEffect(() => {
    if (!open || !inline || !goal || focusedInlineGoalId.current === goalId || !headingRef.current) return
    focusedInlineGoalId.current = goalId
    AccessibilityInfo.sendAccessibilityEvent(headingRef.current, 'focus')
  }, [goal, goalId, inline, open])

  const body = (
    <View style={layout.body}>
      {goal ? <>
        <GoalProgressBlock key={`progress-${goalId}`} goal={{ ...goal, trackingStatus: detailData?.metrics.trackingStatus ?? goal.trackingStatus }} isUpdatingStatus={actions.isUpdatingStatus} onEditProgress={openProgressForm} onComplete={() => void actions.markCompleted()} refetchDetail={refetch} headingRef={headingRef} sweep={outcomes.progressSweep} />
        <GoalAskEntry line={orbitLine} at="top" disabled={!draftHydrated} onPress={openAstra} />
        <GoalForecast metrics={detailData?.metrics ?? null} unit={goal.unit} isLoading={isLoading} />
        <GoalDetailCollections key={`collections-${goalId}`} linkedHabits={goal.linkedHabits} habitAdherence={detailData?.metrics.habitAdherence ?? []} entries={detailData?.goal.progressHistory ?? []} target={goal.targetValue} unit={goal.unit} formatDate={formatDate} onOpenHabit={openHabit} />
        <GoalAskEntry line={orbitLine} at="bottom" disabled={!draftHydrated} onPress={openAstra} />
        <GoalActionFooter isActive={goal.status === 'Active'} isAbandoned={goal.status === 'Abandoned'} isUpdatingStatus={actions.isUpdatingStatus} onMarkAbandoned={() => void actions.markAbandoned()} onReactivate={() => void actions.reactivate()} onEdit={() => setEditing(true)} onDelete={() => setDeleting(true)} defaultIconColor={tokens.fg3} iconColor={tokens.statusBad} />
      </> : isLoading ? <Skeleton variant="settings" label={t('progressScreen.loading')} /> : null}
      {isError ? <InlineLoadError message={t('goals.detail.loadError')} onRetry={() => void refetch()} /> : null}
    </View>
  )

  return (
    <>
      {open && (inline || !editingProgress) ? inline ? <><AppBar title={t('progressScreen.sections.goals')} titleIsHeading={!goal} onBack={close} backLabel={t('common.back')} />{body}</> : <Sheet ref={sheetRef} open onClose={onClose} title={t('progressScreen.sections.goals')}>{body}</Sheet> : null}
      {open && editingProgress && sheetGoal ? <GoalProgressForm key={goalId} goal={sheetGoal} refetchDetail={refetch} asQuestion={guided} onClose={() => { setEditingProgress(false); outcomes.progressFormClosed() }} /> : null}
      {sheetGoal ? <EditGoalModal open={editing} onClose={() => setEditing(false)} goal={sheetGoal} /> : null}
      <GoalStatusResultDialog result={outcomes.result} onClose={outcomes.clearResult} onOpenList={openGoalsList} />
      <ConfirmSheet open={deleting} title={t('goals.detail.delete')} message={t('goals.detail.deleteNamed', { title: goal?.title ?? '' })} confirmLabel={t('goals.detail.delete')} destructive onCancel={() => setDeleting(false)} onConfirm={() => { setDeleting(false); void confirmDelete() }} />
    </>
  )
}

const layout = StyleSheet.create({ body: { gap: 24 } })
