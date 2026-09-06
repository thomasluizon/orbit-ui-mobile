import { Pressable, Text, View } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Bell } from '@/components/ui/icons'
import { useNotificationInbox } from '@/hooks/use-notification-inbox'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { plural } from '@/lib/plural'
import { createStyles } from './notification-bell.styles'

export function NotificationBell() {
  const router = useRouter()
  const pathname = usePathname()
  const { visibleUnreadCount: count } = useNotificationInbox()
  return <NotificationBellDisplay count={count}
    onPress={pathname === '/notifications' ? undefined : () => router.push('/notifications')} />
}

export function NotificationBellDisplay({ count, onPress }: { count: number; onPress?: () => void }) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const label = count > 0 ? plural(t('notifications.bellWithCount', { count }), count) : t('notifications.bell')
  const content = <>
      <Bell size={24} color={tokens.fg2} strokeWidth={1.8} />
      {count > 0 ? <Text accessible={false} testID="notification-count" style={styles.bellCount}>
        {count > 9 ? '9+' : count}
      </Text> : null}
  </>
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={label}
    style={({ pressed }) => [styles.bellButton, pressed && { backgroundColor: tokens.bgHover }]}
    onPress={onPress}>{content}</Pressable>
    : <View accessible accessibilityRole="image" accessibilityLabel={label} style={styles.bellButton}>{content}</View>
}
