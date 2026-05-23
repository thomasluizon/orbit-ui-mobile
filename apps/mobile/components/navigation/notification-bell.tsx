import { useMemo, useState, useCallback, useSyncExternalStore } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { Bell, BellOff, Trash2, X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { formatNotificationRelativeTime } from '@orbit/shared/utils'
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
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useAppToast } from '@/hooks/use-app-toast'
import { plural } from '@/lib/plural'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import {
  cancelPendingNotificationDelete,
  getPendingNotificationDeleteIdsSnapshot,
  queuePendingNotificationDelete,
  subscribePendingNotificationDeleteIds,
} from '@/lib/pending-notification-deletes'

type AppTokens = ReturnType<typeof createTokensV2>

export function NotificationBell() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme, shadows } = useAppTheme()
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

  const styles = useMemo(() => createStyles(tokens, shadows), [tokens, shadows])
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

  function renderNotification({ item }: { item: NotificationItem }) {
    return (
      <TouchableOpacity
        style={[styles.notifRow, !item.isRead && styles.notifUnread]}
        activeOpacity={0.7}
        onPress={() => handlePress(item)}
      >
        <View
          style={[
            styles.unreadDot,
            { backgroundColor: item.isRead ? 'transparent' : tokens.primary },
          ]}
        />
        <View style={styles.notifContent}>
          <Text style={styles.notifTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.notifBody} numberOfLines={2}>
            {item.body}
          </Text>
          <Text style={styles.notifTime}>
            {formatNotificationRelativeTime(item.createdAtUtc, (key, values) =>
              t(`notifications.${key}`, values),
            )}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.deleteBtn}
          activeOpacity={0.7}
          onPress={() => requestDeleteNotification(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <X size={14} color={tokens.fg3} />
        </TouchableOpacity>
      </TouchableOpacity>
    )
  }

  function renderEmpty() {
    if (isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator color={tokens.primary} />
        </View>
      )
    }
    return (
      <View style={styles.emptyContainer}>
        <BellOff size={32} color={tokens.fg3} />
        <Text style={styles.emptyText}>{t('notifications.empty')}</Text>
      </View>
    )
  }

  return (
    <View>
      <TouchableOpacity
        style={styles.bellButton}
        activeOpacity={0.7}
        onPress={toggle}
        accessibilityLabel={
          visibleUnreadCount > 0
            ? plural(t('notifications.bellWithCount', { count: visibleUnreadCount }), visibleUnreadCount)
            : t('notifications.bell')
        }
      >
        <Bell size={17} color={tokens.fg2} strokeWidth={1.5} />
        {visibleUnreadCount > 0 && <View style={styles.bellUnreadDot} />}
      </TouchableOpacity>

      <BottomSheetModal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={t('notifications.title')}
        snapPoints={['88%', '96%']}
      >
        <View style={styles.actionsRow}>
          {visibleUnreadCount > 0 && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => markAllAsRead.mutate()}
            >
              <Text style={styles.markAllText}>
                {t('notifications.markAllRead')}
              </Text>
            </TouchableOpacity>
          )}
          {visibleNotifications.length > 0 && (
            <TouchableOpacity
              style={styles.deleteAllBtn}
              activeOpacity={0.7}
              onPress={() => setShowDeleteAllConfirm(true)}
            >
              <Trash2 size={14} color={tokens.fg3} />
            </TouchableOpacity>
          )}
        </View>

        <BottomSheetScrollView
          style={styles.listScroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            withDrawerContentInset(styles.listContent),
            visibleNotifications.length === 0 && styles.emptyListContainer,
          ]}
        >
          {isLoading && visibleNotifications.length === 0 ? (
            renderEmpty()
          ) : visibleNotifications.length === 0 ? (
            renderEmpty()
          ) : (
            visibleNotifications.map((item) => renderNotification({ item }))
          )}
        </BottomSheetScrollView>
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

function createStyles(tokens: AppTokens, shadows: ReturnType<typeof useAppTheme>['shadows']) {
  return StyleSheet.create({
    bellButton: {
      width: 36,
      height: 36,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bellUnreadDot: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 6,
      height: 6,
      borderRadius: 999,
      backgroundColor: tokens.primary,
      borderWidth: 2,
      borderColor: tokens.bg,
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 12,
      paddingHorizontal: 20,
      marginBottom: 8,
    },
    markAllText: {
      fontSize: 12,
      fontWeight: '600',
      color: tokens.primary,
    },
    deleteAllBtn: {
      padding: 6,
      borderRadius: radius.full,
    },
    notifRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.hairline,
    },
    notifUnread: {
      backgroundColor: tokens.bgSunk,
      borderRadius: radius.md,
      marginHorizontal: -4,
      paddingHorizontal: 8,
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginTop: 5,
    },
    notifContent: {
      flex: 1,
    },
    notifTitle: {
      fontSize: 14,
      fontWeight: '500',
      color: tokens.fg1,
    },
    notifBody: {
      fontSize: 12,
      color: tokens.fg2,
      marginTop: 2,
    },
    notifTime: {
      fontSize: 10,
      color: tokens.fg3,
      marginTop: 4,
    },
    deleteBtn: {
      padding: 6,
      borderRadius: radius.full,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
      gap: 8,
    },
    emptyText: {
      fontSize: 14,
      color: tokens.fg3,
    },
    listScroll: {
      flex: 1,
    },
    listContent: {
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    emptyListContainer: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    _shadow: shadows.lg,
  })
}
