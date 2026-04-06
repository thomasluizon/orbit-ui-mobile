import { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { ArrowRight, Check, Trash2 } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(dateStr: string, t: ReturnType<typeof useTranslation>['t']): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return t('notifications.now')
  if (diffMin < 60) return t('notifications.minutesAgo', { n: diffMin })
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return t('notifications.hoursAgo', { n: diffHours })
  const diffDays = Math.floor(diffHours / 24)
  return t('notifications.daysAgo', { n: diffDays })
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NotificationDetailModalProps {
  open: boolean
  onClose: () => void
  notification: NotificationItem
  onMarkAsRead: (id: string) => void
  onDelete: (id: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationDetailModal({
  open,
  onClose,
  notification,
  onMarkAsRead,
  onDelete,
}: Readonly<NotificationDetailModalProps>) {
  const { t } = useTranslation()
  const router = useRouter()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  function handleView() {
    const url = notification.url
    if (url && url.startsWith('/') && !url.startsWith('//')) {
      onClose()
      router.push(url as never)
    }
  }

  function handleDelete() {
    onDelete(notification.id)
    onClose()
  }

  const hasViewableUrl =
    notification.url &&
    notification.url.startsWith('/') &&
    !notification.url.startsWith('//')

  return (
    <BottomSheetModal
      open={open}
      onClose={onClose}
      title={notification.title}
      snapPoints={['40%']}
    >
      <View style={styles.body}>
        {/* Timestamp */}
        <Text style={styles.timestamp}>
          {formatTime(notification.createdAtUtc, t)}
        </Text>

        {/* Body */}
        <Text style={styles.bodyText}>{notification.body}</Text>

        {/* Actions */}
        <View style={styles.actions}>
          {hasViewableUrl && (
            <TouchableOpacity
              style={styles.actionBtn}
              activeOpacity={0.7}
              onPress={handleView}
            >
              <ArrowRight size={16} color={colors.primary} />
              <Text style={styles.actionText}>{t('notifications.view')}</Text>
            </TouchableOpacity>
          )}

          {!notification.isRead && (
            <TouchableOpacity
              style={styles.actionBtn}
              activeOpacity={0.7}
              onPress={() => onMarkAsRead(notification.id)}
            >
              <Check size={16} color={colors.primary} />
              <Text style={styles.actionText}>
                {t('notifications.markAsRead')}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.actionBtn, styles.deleteActionBtn]}
            activeOpacity={0.7}
            onPress={handleDelete}
          >
            <Trash2 size={16} color={colors.red400} />
            <Text style={styles.deleteActionText}>
              {t('notifications.deleteNotification')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheetModal>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    body: {
      paddingHorizontal: 20,
      gap: 16,
      paddingBottom: 24,
    },
    timestamp: {
      fontSize: 12,
      color: colors.textMuted,
    },
    bodyText: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 8,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: radius.lg,
      backgroundColor: colors.primary_10,
    },
    actionText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
    deleteActionBtn: {
      backgroundColor: colors.red500_10,
    },
    deleteActionText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.red400,
    },
  })
}
