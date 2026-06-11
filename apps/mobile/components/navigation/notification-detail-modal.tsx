import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  formatNotificationRelativeTime,
  getNotificationDetailActionVisibility,
  isViewableNotificationUrl,
} from '@orbit/shared/utils'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface NotificationDetailModalProps {
  open: boolean
  onClose: () => void
  notification: NotificationItem
  onMarkAsRead: (id: string) => void
  onDelete: (id: string) => void
}

/** Sheet chrome with a mono timestamp eyebrow, body copy, and quiet text-button actions. */
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
            <QuietAction
              label={t('notifications.view')}
              color={tokens.fg2}
              onPress={handleView}
            />
          ) : null}
          {canMarkAsRead ? (
            <QuietAction
              label={t('notifications.markAsRead')}
              color={tokens.fg2}
              onPress={() => onMarkAsRead(notification.id)}
            />
          ) : null}
          <QuietAction
            label={t('notifications.deleteNotification')}
            color={tokens.statusBad}
            onPress={handleDelete}
          />
        </View>
      </View>
    </BottomSheetModal>
  )
}

function QuietAction({
  label,
  color,
  onPress,
}: Readonly<{ label: string; color: string; onPress: () => void }>) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        quietActionStyles.press,
        pressed && quietActionStyles.pressed,
      ]}
    >
      <Text style={[quietActionStyles.label, { color }]}>{label}</Text>
    </Pressable>
  )
}

const quietActionStyles = StyleSheet.create({
  press: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
  },
})

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
      fontFamily: 'Roboto_400Regular',
      fontSize: 12,
      color: tokens.fg4,
      letterSpacing: 0.24,
      fontVariant: ['tabular-nums'],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tokens.hairline,
    },
    bodyText: {
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 16,
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      color: tokens.fg2,
      lineHeight: 23,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 10,
      paddingHorizontal: 20,
      paddingTop: 4,
    },
  })
}
