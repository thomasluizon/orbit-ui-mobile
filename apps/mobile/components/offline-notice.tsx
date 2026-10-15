import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { zLayers } from '@orbit/shared/theme'
import { mutationTypeSchema } from '@orbit/shared/types/sync'
import { useOffline } from '@/hooks/use-offline'
import { useOfflineSyncStore } from '@/stores/offline-sync-store'
import { useAppToastStore } from '@/stores/app-toast-store'
import { AppToast, Toast } from '@/components/ui/app-toast'
import { AlertTriangle, RefreshCw, WifiOff } from '@/components/ui/icons'
import { buildHabitCreateHref } from '@orbit/shared/utils'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { enqueue } from '@/lib/offline-queue'
import { buildQueuedMutation, getMutationScope, type DroppedMutation } from '@/lib/offline-mutations'
import { canRetryDroppedMutation, getDroppedItemName, getRecoveryDate, getRecoveryMessage, needsHabitCreation } from '@/lib/offline-recovery'

function DroppedNotice({ drop, remaining }: Readonly<{ drop: DroppedMutation; remaining: number }>) {
  const { t } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const dismissDrop = useOfflineSyncStore((state) => state.dismissDrop)
  const hideDrop = useOfflineSyncStore((state) => state.hideDrop)
  const mutation = drop.mutation
  const needsCreation = needsHabitCreation(mutation)
  const retryable = canRetryDroppedMutation(mutation)
  const scope = mutation.scope ?? getMutationScope(mutation.type) ?? 'profile'
  const date = getRecoveryDate(mutation)
  const item = drop.itemName ?? getDroppedItemName(mutation) ?? t(`common.syncEntity.${scope}`)
  const message = getRecoveryMessage(mutation, item, t)
  const actionLabel = needsCreation ? t('habits.createHabit')
    : t(retryable ? (mutation.type === 'logHabit' ? 'common.syncDroppedAction' : 'common.syncRetryAction') : 'common.syncReviewAction')

  function recover() {
    if (!useOfflineSyncStore.getState().drops.some((entry) => entry.id === drop.id)) return
    if (needsCreation) {
      router.push(buildHabitCreateHref({ date, recoveryId: drop.id }))
      return
    }
    if (retryable) {
      const retry = buildQueuedMutation({ ...mutation, scope, type: mutationTypeSchema.parse(mutation.type) })
      enqueue(mutation.type === 'setTimeZone' ? { ...retry, id: mutation.id } : retry)
    } else {
      router.push(scope === 'habits' || scope === 'goals' || scope === 'tags' ? '/' : '/profile')
    }
    dismissDrop(drop.id)
  }

  return (
    <Toast kind="lost" message={message}
      detail={t(needsCreation ? 'common.syncOrphanedDetail' : remaining > 0 ? 'common.syncDroppedPending' : mutation.type === 'logHabit' ? 'common.syncDroppedDetail' : 'common.syncChangeDroppedDetail')}
      icon={<AlertTriangle size={20} color={tokens.statusBad} />}
      actionLabel={actionLabel} onAction={recover} onDismiss={() => hideDrop(drop.id)} />
  )
}

export function useOfflineNoticeContent() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { isOnline, pendingCount, isFlushing, hasFailed } = useOffline()
  const drop = useOfflineSyncStore((state) => state.drops.find((entry) => !state.hiddenDropIds.includes(entry.id)))
  const currentToast = useAppToastStore((state) => state.currentToast)
  const [sawPending, setSawPending] = useState(false)
  const clearSynced = useCallback(() => setSawPending(false), [])
  const pendingNoticeVisible = pendingCount > 0 && (!isOnline || !hasFailed || isFlushing)
  if (pendingNoticeVisible && !sawPending && !drop) setSawPending(true)
  if (drop && sawPending) setSawPending(false)

  let notice
  if (drop) notice = <DroppedNotice key={drop.id} drop={drop} remaining={pendingCount} />
  else if (pendingCount > 0 && isFlushing) notice = <Toast kind="working" message={t('common.syncing', { count: pendingCount })} />
  else if (pendingCount > 0 && isOnline && hasFailed) notice = <Toast kind="neutral" icon={<RefreshCw size={20} color={tokens.fg2} />} message={t('common.syncRetrying')} />
  else if (pendingCount > 0) notice = <Toast kind="neutral" icon={<WifiOff size={20} color={tokens.fg2} />} message={t('common.queued', { count: pendingCount })} />
  else if (sawPending && !isFlushing) notice = <Toast kind="done" message={t('common.synced')} onDone={clearSynced} />
  if (!notice && !currentToast) return null

  return <View style={styles.host} testID="offline-notice">{notice}<AppToast placement="slot" /></View>
}

export function OfflineNotice() {
  return useOfflineNoticeContent()
}

const styles = StyleSheet.create({
  host: { paddingVertical: 16, gap: 12, zIndex: zLayers.toast },
})
