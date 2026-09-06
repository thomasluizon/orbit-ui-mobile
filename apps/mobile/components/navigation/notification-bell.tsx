import { Pressable, Text } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Bell } from '@/components/ui/icons'
import { useNotificationInbox } from '@/hooks/use-notification-inbox'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { plural } from '@/lib/plural'
import { createStyles } from './notification-bell.styles'

export function NotificationBell() {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const { visibleUnreadCount: count } = useNotificationInbox()
  return (
    <Pressable accessibilityRole="button"
      accessibilityLabel={count > 0 ? plural(t('notifications.bellWithCount', { count }), count) : t('notifications.bell')}
      style={({ pressed }) => [styles.bellButton, pressed && { backgroundColor: tokens.bgHover }]}
      onPress={() => { if (pathname !== '/notifications') router.push('/notifications') }}>
      <Bell size={24} color={tokens.fg2} strokeWidth={1.8} />
      {count > 0 ? <Text accessible={false} testID="notification-count" style={styles.bellCount}>
        {count > 9 ? '9+' : count}
      </Text> : null}
    </Pressable>
  )
}
