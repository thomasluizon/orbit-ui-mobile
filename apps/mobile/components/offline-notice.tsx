import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { zLayers } from '@orbit/shared/theme'
import { mutationTypeSchema } from '@orbit/shared/types/sync'
import { useOffline } from '@/hooks/use-offline'
import { useOfflineSyncStore } from '@/stores/offline-sync-store'
import { AppToast, Toast } from '@/components/ui/app-toast'
import { AlertTriangle, RefreshCw, WifiOff, X } from '@/components/ui/icons'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
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
  const [creating, setCreating] = useState(false)
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
      setCreating(true)
      return
    }
    if (retryable) {
      enqueue(buildQueuedMutation({ ...mutation, scope, type: mutationTypeSchema.parse(mutation.type) }))
    } else {
      router.push(scope === 'habits' || scope === 'goals' || scope === 'tags' ? '/' : '/preferences')
    }
    dismissDrop(drop.id)
  }

  return (
    <View style={styles.dropped}>
      <Toast kind="lost" message={message}
        detail={t(needsCreation ? 'common.syncOrphanedDetail' : remaining > 0 ? 'common.syncDroppedPending' : mutation.type === 'logHabit' ? 'common.syncDroppedDetail' : 'common.syncChangeDroppedDetail')}
        icon={<AlertTriangle size={20} color={tokens.statusBad} />}
        actionLabel={actionLabel} onAction={recover} />
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.dismiss')}
        disabled={creating} onPress={() => dismissDrop(drop.id)} style={styles.dismiss}>
        <X size={20} color={tokens.fg2} />
      </Pressable>
      <CreateHabitModal open={creating} initialDate={date} recoveryMessage={message}
        onClose={() => { setCreating(false); dismissDrop(drop.id) }} />
    </View>
  )
}

export function OfflineNotice() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { isOnline, pendingCount, isFlushing, hasFailed } = useOffline()
  const drop = useOfflineSyncStore((state) => state.drops[0])
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
  else return <AppToast placement="slot" />

  return <View style={styles.host} testID="offline-notice">{notice}</View>
}

const styles = StyleSheet.create({
  host: { padding: 16, zIndex: zLayers.toast },
  dropped: { gap: 4 },
  dismiss: { alignSelf: 'flex-end', minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
})
