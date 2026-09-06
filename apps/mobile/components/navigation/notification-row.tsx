import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight, Trash2 } from '@/components/ui/icons'
import { formatNotificationRelativeTime, getNotificationTargetKey } from '@orbit/shared/utils'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function NotificationRow({ item, onOpen, onDelete }: Readonly<{
  item: NotificationItem
  onOpen: (item: NotificationItem) => void
  onDelete: (item: NotificationItem) => void
}>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const targetKey = getNotificationTargetKey(item.url)
  return (
    <View testID={item.isRead ? 'notification-read' : 'notification-unread'}
      style={[styles.wrapper, !item.isRead && { backgroundColor: tokens.bgCard, boxShadow: `inset 0 0 0 1px ${tokens.hairline}` }]}>
      <Pressable accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${t(item.isRead ? 'notifications.read' : 'notifications.unread')}`}
        onPress={() => onOpen(item)}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: tokens.bgHover }]}>
        <View testID="notification-dot-column" style={styles.dotColumn}>
          {!item.isRead ? <View testID="notification-unread-dot" style={[styles.dot, { backgroundColor: tokens.fg1 }]} /> : null}
        </View>
        <View style={styles.content}>
          <View style={styles.topRow}>
            <Text testID="notification-title" style={[styles.title, {
              fontFamily: item.isRead ? 'Geist_400Regular' : 'Geist_500Medium',
              color: item.isRead ? tokens.fg2 : tokens.fg1,
            }]}>{item.title}</Text>
            <Text style={[styles.meta, { color: tokens.fg4 }]}>
              {formatNotificationRelativeTime(item.createdAtUtc, (key, values) => t(`notifications.${key}`, values))}
            </Text>
          </View>
          <Text style={[styles.body, { color: tokens.fg3 }]}>{item.body}</Text>
          {targetKey ? <View style={styles.target}>
            <ArrowUpRight size={16} color={tokens.fg4} />
            <Text style={[styles.meta, { color: tokens.fg4 }]}>{t(targetKey)}</Text>
          </View> : null}
        </View>
      </Pressable>
      <Pressable accessibilityRole="button"
        accessibilityLabel={t('notifications.deleteNotification', { title: item.title })}
        onPress={() => onDelete(item)}
        style={({ pressed }) => [styles.delete, pressed && { backgroundColor: tokens.bgHover }]}>
        <Trash2 size={20} color={tokens.statusBad} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { flexDirection: 'row', alignItems: 'stretch', gap: 4, borderRadius: 12 },
  row: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, minHeight: 44, borderRadius: 12 },
  dotColumn: { width: 8, flexShrink: 0, alignSelf: 'stretch', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 999 },
  content: { flex: 1, minWidth: 0, gap: 4 },
  topRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 22.4 },
  meta: { fontFamily: 'GeistMono_400Regular', fontSize: 12 },
  body: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21 },
  target: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  delete: { width: 44, height: 44, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
})
