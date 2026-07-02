import { useMemo, useState, useCallback, useSyncExternalStore } from 'react'
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  FlatList,
} from 'react-native'
import { Bell, BellOff, CheckCheck, Trash2 } from 'lucide-react-native'
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
  tokens: AppTokens
  styles: NotificationBellStyles
  isLoading: boolean
}

function NotificationListEmpty({
  tokens,
  styles,
  isLoading,
}: Readonly<NotificationListEmptyProps>) {
  const { t } = useTranslation()
  if (isLoading) {
    return (
      <View style={styles.emptyContainer}>
        <ActivityIndicator color={tokens.primary} />
      </View>
    )
  }
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.notifGlyphCircle}>
        <BellOff size={20} color={tokens.fg3} strokeWidth={1.8} />
      </View>
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
  const { notifications, isLoading } = useNotifications()
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
    setSelectedNotification(null)
  }

  function renderNotification({ item, index }: { item: NotificationItem; index: number }) {
    return NotificationRow({
      item,
      index,
      tokens,
      styles,
      t,
      onPress: handlePress,
      onRequestDelete: requestDeleteNotification,
    })
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
        accessibilityLabel={
          visibleUnreadCount > 0
            ? plural(t('notifications.bellWithCount', { count: visibleUnreadCount }), visibleUnreadCount)
            : t('notifications.bell')
        }
      >
        <Bell size={22} color={tokens.fg1} strokeWidth={1.8} />
        {visibleUnreadCount > 0 && <View style={styles.bellUnreadDot} />}
      </Pressable>

      <BottomSheetModal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={t('notifications.title')}
        snapPoints={['88%', '96%']}
      >
        <FlatList
          style={styles.listScroll}
          data={visibleNotifications}
          keyExtractor={(item) => item.id}
          renderItem={renderNotification}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <NotificationListActions
              tokens={tokens}
              styles={styles}
              showMarkAllRead={visibleUnreadCount > 0}
              showDeleteAll={visibleNotifications.length > 0}
              onMarkAllRead={() => markAllAsRead.mutate()}
              onDeleteAll={() => setShowDeleteAllConfirm(true)}
            />
          }
          ListEmptyComponent={
            <NotificationListEmpty
              tokens={tokens}
              styles={styles}
              isLoading={isLoading}
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
          notification={selectedNotification}
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
