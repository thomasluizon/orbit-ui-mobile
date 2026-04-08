import { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { ArrowRight, Check, Trash2 } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  formatNotificationRelativeTime,
  getNotificationDetailActionVisibility,
  isViewableNotificationUrl,
} from '@orbit/shared/utils'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

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
  const { canView, canMarkAsRead } = getNotificationDetailActionVisibility(notification)

  function handleView() {
    const url = notification.url
    if (isViewableNotificationUrl(url)) {
      onClose()
      router.push(url as never)
    }
  }

  function handleDelete() {
    onDelete(notification.id)
    onClose()
  }

  return (
    <BottomSheetModal
      open={open}
      onClose={onClose}
      title={notification.title}
      snapPoints={['78%', '92%']}
    >
      <View style={styles.container}>
        <View style={styles.body}>
          <Text style={styles.timestamp}>
            {formatNotificationRelativeTime(notification.createdAtUtc, (key, values) =>
              t(`notifications.${key}`, values),
            )}
          </Text>
          <Text style={styles.bodyText}>{notification.body}</Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.actions}>
            {canView && (
              <TouchableOpacity
                style={styles.actionBtn}
                activeOpacity={0.7}
                onPress={handleView}
              >
                <ArrowRight size={16} color={colors.primary} />
                <Text style={styles.actionText}>{t('notifications.view')}</Text>
              </TouchableOpacity>
            )}

            {canMarkAsRead && (
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
      </View>
    </BottomSheetModal>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

type NotificationDetailColors = {
  primary: string
  red400: string
  surface: string
  surfaceElevated: string
  borderMuted: string
  textMuted: string
  textSecondary: string
  textPrimary: string
  red500_10: string
  primary_10: string
}

function createStyles(colors: NotificationDetailColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'space-between',
      paddingBottom: 24,
    },
    body: {
      paddingHorizontal: 20,
      gap: 16,
      paddingTop: 4,
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
    },
    footer: {
      marginTop: 20,
      paddingTop: 16,
      paddingHorizontal: 20,
      borderTopWidth: 1,
      borderTopColor: colors.borderMuted,
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
