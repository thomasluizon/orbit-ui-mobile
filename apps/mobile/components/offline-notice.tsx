import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, RefreshCw, WifiOff, X } from 'lucide-react-native'
import { mutationTypeSchema } from '@orbit/shared/types/sync'
import { zLayers } from '@orbit/shared/theme'
import { useOffline } from '@/hooks/use-offline'
import { useOfflineSyncStore } from '@/stores/offline-sync-store'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { enqueue } from '@/lib/offline-queue'
import { buildQueuedMutation, getMutationScope, type DroppedMutation } from '@/lib/offline-mutations'
import {
  canRetryDroppedMutation,
  getDroppedItemName,
  getRecoveryDate,
  getRecoveryMessage,
  needsHabitCreation,
} from '@/lib/offline-recovery'

function DroppedNotice({ drop, remaining }: Readonly<{
  drop: DroppedMutation
  remaining: number
}>) {
  const { t } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const dismissDrop = useOfflineSyncStore((state) => state.dismissDrop)
  const [creating, setCreating] = useState(false)
  const mutation = drop.mutation
  const needsCreation = needsHabitCreation(mutation)
  const retryable = canRetryDroppedMutation(mutation)
  const scope = mutation.scope ?? getMutationScope(mutation.type) ?? 'profile'
  const item = drop.itemName ?? getDroppedItemName(mutation) ?? t(`common.syncEntity.${scope}`)
  const message = getRecoveryMessage(mutation, item, t)
  const detail = t(
    needsCreation
      ? 'common.syncOrphanedDetail'
      : remaining > 0
        ? 'common.syncDroppedPending'
        : mutation.type === 'logHabit'
          ? 'common.syncDroppedDetail'
          : 'common.syncChangeDroppedDetail',
  )
  const actionLabel = needsCreation
    ? t('habits.createHabit')
    : t(
        retryable
          ? mutation.type === 'logHabit'
            ? 'common.syncDroppedAction'
            : 'common.syncRetryAction'
          : 'common.syncReviewAction',
      )

  function recover() {
    if (!useOfflineSyncStore.getState().drops.some((entry) => entry.id === drop.id)) return
    if (needsCreation) {
      setCreating(true)
      return
    }
    if (retryable) {
      enqueue(buildQueuedMutation({
        ...mutation,
        scope,
        type: mutationTypeSchema.parse(mutation.type),
      }))
    } else {
      router.push(scope === 'habits' || scope === 'goals' || scope === 'tags' ? '/' : '/preferences')
    }
    dismissDrop(drop.id)
  }

  return (
    <>
      <View style={[styles.notice, { backgroundColor: tokens.bgSheet, borderColor: tokens.hairline }]}>
        <AlertTriangle size={20} color={tokens.statusBad} />
        <View style={styles.copy}>
          <Text style={[styles.message, { color: tokens.fg1 }]}>{message}</Text>
          <Text style={[styles.detail, { color: tokens.fg3 }]}>{detail}</Text>
          <Pressable accessibilityRole="button" onPress={recover} style={styles.action}>
            <Text style={[styles.actionText, { color: tokens.primarySoft }]}>{actionLabel}</Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.dismiss')}
          onPress={() => dismissDrop(drop.id)}
          style={styles.dismiss}
        >
          <X size={20} color={tokens.fg2} />
        </Pressable>
      </View>
      <CreateHabitModal
        open={creating}
        initialDate={getRecoveryDate(mutation)}
        recoveryMessage={message}
        onClose={() => setCreating(false)}
        onCreated={() => dismissDrop(drop.id)}
      />
    </>
  )
}

export function OfflineNotice() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const { isOnline, pendingCount, isFlushing, hasFailed } = useOffline()
  const drop = useOfflineSyncStore((state) => state.drops[0])
  const [previousPendingCount, setPreviousPendingCount] = useState(pendingCount)
  const [showSynced, setShowSynced] = useState(false)

  if (pendingCount !== previousPendingCount) {
    setPreviousPendingCount(pendingCount)
    setShowSynced(previousPendingCount > 0 && pendingCount === 0 && !isFlushing)
  }

  useEffect(() => {
    if (!showSynced) return
    const timer = setTimeout(() => setShowSynced(false), 5_000)
    return () => clearTimeout(timer)
  }, [showSynced])

  if (drop) return <DroppedNotice drop={drop} remaining={pendingCount} />

  let icon = <WifiOff size={20} color={tokens.fg2} />
  let message = t('common.queued', { count: pendingCount })
  if (pendingCount > 0 && isFlushing) {
    icon = <Text style={[styles.working, { color: tokens.fg2 }]}>•••</Text>
    message = t('common.syncing', { count: pendingCount })
  } else if (pendingCount > 0 && isOnline && hasFailed) {
    icon = <RefreshCw size={20} color={tokens.fg2} />
    message = t('common.syncRetrying')
  } else if (showSynced) {
    icon = <Check size={20} color={tokens.statusDone} />
    message = t('common.synced')
  } else if (pendingCount === 0) {
    return null
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.notice, { backgroundColor: tokens.bgSheet, borderColor: tokens.hairline }]}
      testID="offline-notice"
    >
      {icon}
      <Text style={[styles.message, { color: tokens.fg1 }]}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    padding: 16,
    borderWidth: 1,
    borderRadius: radius.xl,
    zIndex: zLayers.toast,
  },
  copy: { flex: 1, gap: 4 },
  message: { flex: 1, fontFamily: 'Rubik_500Medium', fontSize: 14 },
  detail: { fontFamily: 'Rubik_400Regular', fontSize: 14, lineHeight: 20 },
  working: { fontFamily: 'Rubik_700Bold', letterSpacing: 2 },
  action: { alignSelf: 'flex-start', paddingVertical: 8 },
  actionText: { fontFamily: 'Rubik_500Medium', fontSize: 14, textDecorationLine: 'underline' },
  dismiss: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
})
