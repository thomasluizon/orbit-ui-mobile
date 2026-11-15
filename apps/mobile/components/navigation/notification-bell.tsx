import { useEffect, useState, type ReactNode } from 'react'
import { Animated, Easing, Text, View } from 'react-native'
import { motionDurations, motionEasings, motionLayerTiming } from '@orbit/shared/theme'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Bell } from '@/components/ui/icons'
import { IconButton } from '@/components/ui/icon-button'
import { useFlag } from '@/hooks/use-flag'
import { useNotificationInbox } from '@/hooks/use-notification-inbox'
import { usePrefersReducedMotion } from '@/lib/motion'
import { requestHabitCreateNavigation } from '@/hooks/use-habit-create-navigation-guard'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { plural } from '@/lib/plural'
import { createStyles } from './notification-bell.styles'
import { useUIStore } from '@/stores/ui-store'

export function NotificationBell() {
  const router = useRouter()
  const pathname = usePathname()
  const { visibleUnreadCount: count } = useNotificationInbox()
  return <NotificationBellDisplay count={count}
    onPress={pathname === '/notifications' ? undefined : () => requestHabitCreateNavigation(
      () => {
        useUIStore.getState().setAstraConversationOpen(false)
        router.push('/notifications')
      },
      () => {
        useUIStore.getState().setAstraConversationOpen(false)
        router.replace('/notifications')
      },
    )} />
}

/** True from the first change of the count, so the count the bell opens with never rolls. */
function useCountChanged(count: number): boolean {
  const [first] = useState(count)
  const [changed, setChanged] = useState(false)
  if (!changed && count !== first) setChanged(true)
  return changed
}

/** A changed count rolls up into the pill once. The pill clips the figure and stays in place. */
function CountRoll({ children }: Readonly<{ children: ReactNode }>) {
  const [progress] = useState(() => new Animated.Value(0))
  useEffect(() => {
    const roll = Animated.timing(progress, { toValue: 1, duration: motionDurations.slow, easing: Easing.bezier(...motionEasings.standard), useNativeDriver: true })
    roll.start()
    return () => roll.stop()
  }, [progress])
  return <Animated.View testID="notification-count-roll" style={{ opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [motionLayerTiming.routeShift, 0] }) }] }}>{children}</Animated.View>
}

export function NotificationBellDisplay({ count, onPress }: { count: number; onPress?: () => void }) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const reducedMotion = usePrefersReducedMotion()
  const changed = useCountChanged(count)
  const rolls = useFlag('orbit_guided_flows') && changed && !reducedMotion
  const label = count > 0 ? plural(t('notifications.bellWithCount', { count }), count) : t('notifications.bell')
  const glyph = <Bell size={24} color={tokens.fg2} strokeWidth={1.8} />
  const shown = count > 9 ? '9+' : count
  const figure = <Text accessible={false} testID="notification-count" maxFontSizeMultiplier={1} style={[styles.bellCount, rolls ? styles.rollingCount : null]}>{shown}</Text>
  const marker = count > 0 ? <View accessible={false} importantForAccessibility="no-hide-descendants"
    pointerEvents="none" style={[styles.countMarker, rolls ? styles.countClip : null, onPress ? { position: 'absolute', top: 0, right: 0 } : null]}>
    {rolls ? <CountRoll key={shown}>{figure}</CountRoll> : figure}
  </View> : null
  return onPress ? <View style={styles.bellAction}>
      <IconButton label={label} onClick={onPress}>{glyph}</IconButton>{marker}
    </View>
    : <View accessible accessibilityRole="image" accessibilityLabel={label} style={styles.bellDisplay}>{glyph}{marker}</View>
}
