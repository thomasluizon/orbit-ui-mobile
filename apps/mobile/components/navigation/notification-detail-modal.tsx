import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  formatNotificationRelativeTime,
  getNotificationDetailActionVisibility,
  isViewableNotificationUrl,
} from '@orbit/shared/utils'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { SettingsRow } from '@/components/ui/settings-row'
import { createTokensV2 } from '@/lib/theme'
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
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const { canView, canMarkAsRead } = getNotificationDetailActionVisibility(
    notification,
  )

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
        <Text style={styles.timestamp}>
          {formatNotificationRelativeTime(
            notification.createdAtUtc,
            (key, values) => t(`notifications.${key}`, values),
          )}
        </Text>
        <Text style={styles.bodyText}>{notification.body}</Text>

        <View style={styles.actions}>
          {canView ? (
            <SettingsRow
              label={t('notifications.view')}
              onPress={handleView}
              accessory="chevron"
            />
          ) : null}
          {canMarkAsRead ? (
            <SettingsRow
              label={t('notifications.markAsRead')}
              onPress={() => onMarkAsRead(notification.id)}
              accessory="none"
            />
          ) : null}
          <SettingsRow
            label={t('notifications.deleteNotification')}
            onPress={handleDelete}
            accessory="none"
            valueColor={tokens.fg3}
          />
        </View>
      </View>
    </BottomSheetModal>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      paddingBottom: 24,
    },
    timestamp: {
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 10,
      fontFamily: 'GeistMono',
      fontSize: 11,
      color: tokens.fg3,
      letterSpacing: 0.44,
      fontVariant: ['tabular-nums'],
    },
    bodyText: {
      paddingHorizontal: 20,
      paddingBottom: 16,
      fontFamily: 'Geist',
      fontSize: 14,
      color: tokens.fg2,
      lineHeight: 21,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.hairline,
    },
    actions: {
      paddingTop: 8,
    },
  })
}
