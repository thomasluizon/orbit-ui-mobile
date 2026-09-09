import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, StyleSheet, View } from 'react-native'
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
import { createStyles } from './goal-detail-drawer/styles'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface GoalDetailDrawerProps {
  open: boolean
  inline?: boolean
  goalId: string
  onClose: () => void
}

export function GoalDetailDrawer({ open, inline = false, goalId, onClose }: Readonly<GoalDetailDrawerProps>) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const { showError } = useAppToast()
  const { data: goalsData } = useGoals()
  const { data: detailData, isLoading, isError, refetch } = useGoalDetail(open ? goalId : null)
  const goal = detailData?.goal ?? goalsData?.goalsById.get(goalId) ?? null
  const deleteGoal = useDeleteGoal()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { sheetRef, closeSheet } = useSheetHost()
  const close = useCallback(() => {
    if (inline) onClose()
    else closeSheet(onClose)
  }, [inline, closeSheet, onClose])
  const actions = useGoalStatusActions({
    goalId,
    goalName: goal?.title,
    goalCount: goal?.targetValue,
    goalUnit: goal?.unit,
    refetchDetail: () => void refetch(),
  })
  const formatDate = (date: string) => formatLocaleDateTime(date, locale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit' })

  async function confirmDelete() {
    try {
      await deleteGoal.mutateAsync(goalId)
      close()
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, t, 'goals.errors.delete', 'goal'))
    }
  }

  useEffect(() => {
    if (!open || !inline || editing || deleting) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true })
    return () => subscription.remove()
  }, [open, inline, editing, deleting, close])

  const body = (
    <View style={layout.body}>
      {goal ? <>
        <GoalProgressBlock key={`progress-${goalId}`} goal={{ ...goal, trackingStatus: detailData?.metrics.trackingStatus ?? goal.trackingStatus }} isUpdatingStatus={actions.isUpdatingStatus} onComplete={() => void actions.markCompleted()} refetchDetail={refetch} />
        <GoalDetailCollections key={`collections-${goalId}`} linkedHabits={goal.linkedHabits} entries={detailData?.goal.progressHistory ?? []} unit={goal.unit} formatDate={formatDate} />
        <GoalActionFooter isActive={goal.status === 'Active'} isAbandoned={goal.status === 'Abandoned'} isUpdatingStatus={actions.isUpdatingStatus} onMarkAbandoned={() => void actions.markAbandoned()} onReactivate={() => void actions.reactivate()} onEdit={() => setEditing(true)} onDelete={() => setDeleting(true)} iconColor={tokens.fg3} dangerColor={tokens.statusBad} styles={styles} />
      </> : isLoading ? <Skeleton variant="settings" label={t('progressScreen.loading')} /> : null}
      {isError ? <GoalLoadError onRetry={() => void refetch()} styles={styles} /> : null}
    </View>
  )

  return (
    <>
      {open ? inline ? <><AppBar title={t('progressScreen.sections.goals')} onBack={close} backLabel={t('common.back')} />{body}</> : <Sheet ref={sheetRef} open onClose={onClose} title={t('progressScreen.sections.goals')}>{body}</Sheet> : null}
      {goal ? <EditGoalModal open={editing} onClose={() => setEditing(false)} goal={goal} /> : null}
      <ConfirmSheet open={deleting} title={t('goals.detail.delete')} message={t('goals.detail.deleteNamed', { title: goal?.title ?? '' })} confirmLabel={t('goals.detail.delete')} destructive onCancel={() => setDeleting(false)} onConfirm={() => { setDeleting(false); void confirmDelete() }} />
    </>
  )
}

const layout = StyleSheet.create({ body: { gap: 24 } })
