import { useMemo, useState, useCallback, useSyncExternalStore } from 'react'
import { View, Text, Pressable } from 'react-native'
import Animated, { LinearTransition, ReduceMotion, ZoomIn } from 'react-native-reanimated'
import { Bell, CheckCheck, Trash2 } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { NotificationItem } from '@orbit/shared/types/notification'
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDeleteNotification,
  useDeleteAllNotifications,
} from '@/hooks/use-notifications'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { withDrawerContentInset } from '@/components/ui/drawer-content-inset'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
import { SkeletonLine } from '@/components/ui/skeleton'
import { NotificationDetailModal } from './notification-detail-modal'
import { NotificationRow } from './notification-row'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useAppToast } from '@/hooks/use-app-toast'
import { plural } from '@/lib/plural'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import {
  cancelPendingNotificationDelete,
  getPendingNotificationDeleteIdsSnapshot,
  queuePendingNotificationDelete,
  subscribePendingNotificationDeleteIds,
} from '@/lib/pending-notification-deletes'
import {
  createStyles,
  type AppTokens,
  type NotificationBellStyles,
} from './notification-bell.styles'

interface NotificationListActionsProps {
  tokens: AppTokens
  styles: NotificationBellStyles
  showMarkAllRead: boolean
  showDeleteAll: boolean
  onMarkAllRead: () => void
  onDeleteAll: () => void
}

function NotificationListActions({
  tokens,
  styles,
  showMarkAllRead,
  showDeleteAll,
  onMarkAllRead,
  onDeleteAll,
}: Readonly<NotificationListActionsProps>) {
  const { t } = useTranslation()
  return (
    <View style={styles.actionsRow}>
      {showMarkAllRead && (
        <Pressable
          style={({ pressed }) => [
            styles.sheetActionBtn,
            pressed ? styles.deleteBtnPressed : null,
          ]}
          hitSlop={2}
          onPress={onMarkAllRead}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.markAllRead')}
        >
          {({ pressed }) => (
            <CheckCheck
              size={18}
              color={pressed ? tokens.primarySoft : tokens.fg3}
              strokeWidth={1.8}
            />
          )}
        </Pressable>
      )}
      {showDeleteAll && (
        <Pressable
          style={({ pressed }) => [
            styles.sheetActionBtn,
            pressed ? styles.deleteBtnPressed : null,
          ]}
          hitSlop={2}
          onPress={onDeleteAll}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.deleteAll')}
        >
          {({ pressed }) => (
            <Trash2
              size={18}
              color={pressed ? tokens.statusBad : tokens.fg3}
              strokeWidth={1.8}
            />
          )}
        </Pressable>
      )}
    </View>
  )
}

interface NotificationListEmptyProps {
  styles: NotificationBellStyles
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}

function NotificationListEmpty({
  styles,
  isLoading,
  isError,
  onRetry,
}: Readonly<NotificationListEmptyProps>) {
  const { t } = useTranslation()
  if (isLoading) {
    return (
      <View style={styles.loadingState} accessibilityLabel={t('common.loading')}>
        <SkeletonLine height={48} />
        <SkeletonLine height={48} />
      </View>
    )
  }
  if (isError) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t('notifications.loadError')}</Text>
        <Pressable
          style={({ pressed }) => [
            styles.retryChip,
            pressed ? styles.retryChipPressed : null,
          ]}
          hitSlop={{ top: 4, bottom: 4 }}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={t('common.retry')}
        >
          <Text style={styles.retryChipLabel}>{t('common.retry')}</Text>
        </Pressable>
      </View>
    )
  }
  return (
    <View style={styles.emptyContainer}>
      <SatelliteGlyph size={96} />
      <Text style={styles.emptyText}>{t('notifications.empty')}</Text>
    </View>
  )
}

export function NotificationBell() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const { notifications, isLoading, isError, refetch } = useNotifications()
  const markAsRead = useMarkNotificationRead()
  const markAllAsRead = useMarkAllNotificationsRead()
  const deleteNotification = useDeleteNotification()
  const deleteAll = useDeleteAllNotifications()
  const { showQueued } = useAppToast()

  const [isOpen, setIsOpen] = useState(false)
  const [selectedNotification, setSelectedNotification] =
    useState<NotificationItem | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false)
  const pendingDeleteIds = useSyncExternalStore(
    subscribePendingNotificationDeleteIds,
    getPendingNotificationDeleteIdsSnapshot,
    getPendingNotificationDeleteIdsSnapshot,
  )
  const pendingDeleteIdSet = useMemo(() => new Set(pendingDeleteIds), [pendingDeleteIds])

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const styles = useMemo(() => createStyles(tokens), [tokens])
  const visibleNotifications = useMemo(
    () => notifications.filter((item) => !pendingDeleteIdSet.has(item.id)),
    [notifications, pendingDeleteIdSet],
  )
  const visibleUnreadCount = useMemo(
    () => visibleNotifications.filter((item) => !item.isRead).length,
    [visibleNotifications],
  )

  const cancelPendingDelete = useCallback((notificationId: string) => {
    cancelPendingNotificationDelete(notificationId)
  }, [])

  const requestDeleteNotification = useCallback((notification: NotificationItem) => {
    const queued = queuePendingNotificationDelete(notification.id, () => {
      deleteNotification.mutate(notification.id)
    })
    if (!queued) return

    showQueued(t('notifications.deleteQueued'), t('notifications.deleteUndo'), () => {
      cancelPendingDelete(notification.id)
    })
  }, [cancelPendingDelete, deleteNotification, showQueued, t])

  function handlePress(notification: NotificationItem) {
    setSelectedNotification(notification)
    setIsDetailOpen(true)
    setIsOpen(false)
    if (!notification.isRead) {
      markAsRead.mutate(notification.id)
    }
  }

  function handleDetailMarkAsRead(id: string) {
    markAsRead.mutate(id)
  }

  function handleDetailDelete(id: string) {
    const notification = notifications.find((item) => item.id === id)
    if (notification) {
      requestDeleteNotification(notification)
    }
  }

  function renderNotification({ item, index }: { item: NotificationItem; index: number }) {
    return (
      <NotificationRow
        item={item}
        index={index}
        tokens={tokens}
        styles={styles}
        t={t}
        onPress={handlePress}
        onRequestDelete={requestDeleteNotification}
      />
    )
  }

  return (
    <View>
      <Pressable
        style={({ pressed }) => [
          styles.bellButton,
          { backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev },
          pressed ? styles.bellPressed : null,
        ]}
        hitSlop={2}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={
          visibleUnreadCount > 0
            ? plural(t('notifications.bellWithCount', { count: visibleUnreadCount }), visibleUnreadCount)
            : t('notifications.bell')
        }
      >
        <Bell size={22} color={tokens.fg1} strokeWidth={1.8} />
        {visibleUnreadCount > 0 && (
          <Animated.View
            style={styles.bellUnreadDot}
            entering={ZoomIn.duration(160).reduceMotion(ReduceMotion.System)}
          />
        )}
      </Pressable>

      <BottomSheetModal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={t('notifications.title')}
        snapPoints={['88%', '96%']}
      >
        <NotificationListActions
          tokens={tokens}
          styles={styles}
          showMarkAllRead={visibleUnreadCount > 0}
          showDeleteAll={visibleNotifications.length > 0}
          onMarkAllRead={() => markAllAsRead.mutate()}
          onDeleteAll={() => setShowDeleteAllConfirm(true)}
        />
        <Animated.FlatList
          style={styles.listScroll}
          data={visibleNotifications}
          keyExtractor={(item) => item.id}
          renderItem={renderNotification}
          showsVerticalScrollIndicator={false}
          itemLayoutAnimation={LinearTransition}
          ListEmptyComponent={
            <NotificationListEmpty
              styles={styles}
              isLoading={isLoading}
              isError={isError}
              onRetry={() => void refetch()}
            />
          }
          contentContainerStyle={[
            withDrawerContentInset(styles.listContent),
            visibleNotifications.length === 0 && styles.emptyListContainer,
          ]}
        />
      </BottomSheetModal>

      {selectedNotification && (
        <NotificationDetailModal
          open={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
          notification={
            notifications.find((item) => item.id === selectedNotification.id) ??
            selectedNotification
          }
          onMarkAsRead={handleDetailMarkAsRead}
          onDelete={handleDetailDelete}
        />
      )}
      <ConfirmDialog
        open={showDeleteAllConfirm}
        onOpenChange={setShowDeleteAllConfirm}
        title={t('notifications.deleteAllConfirmTitle')}
        description={t('notifications.deleteAllConfirmDescription')}
        confirmLabel={t('notifications.deleteAll')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => deleteAll.mutate()}
        variant="danger"
      />
    </View>
  )
}
