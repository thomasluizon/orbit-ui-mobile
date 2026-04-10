import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useTourTarget } from '@/hooks/use-tour-target'
import { usePathname, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  CalendarDays,
  Home,
  MessageCircle,
  Plus,
  User,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { formatAPIDate } from '@orbit/shared/utils'
import { useUIStore } from '@/stores/ui-store'
import { useAppTheme } from '@/lib/use-app-theme'

interface BottomNavProps {
  onCreate?: () => void
}

interface NavItem {
  icon: typeof Home
  label: string
  path: '/chat' | '/calendar' | '/profile' | '/'
}

export function BottomNav({ onCreate }: Readonly<BottomNavProps>) {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  const { colors, nav } = useAppTheme()
  const setSelectedDate = useUIStore((s) => s.setSelectedDate)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const fabRef = useRef<View>(null)
  useTourTarget('tour-fab-button', fabRef)

  const navItems = useMemo<NavItem[]>(
    () => [
      { icon: Home, label: t('nav.habits'), path: '/' },
      { icon: MessageCircle, label: t('nav.chat'), path: '/chat' },
      { icon: CalendarDays, label: t('nav.calendar'), path: '/calendar' },
      { icon: User, label: t('nav.profile'), path: '/profile' },
    ],
    [t],
  )

  const isActive = useCallback(
    (path: NavItem['path']) => pathname === path || pathname === `${path}/`,
    [pathname],
  )

  const handleNavPress = useCallback(
    (item: NavItem) => {
      if (item.path === '/') {
        setSelectedDate(formatAPIDate(new Date()))
        setActiveView('today')
      }
      router.push(item.path)
    },
    [router, setActiveView, setSelectedDate],
  )

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={[styles.navGlass, { backgroundColor: nav.tabBarBg, borderTopColor: nav.tabBarBorder }]}>
        <View style={styles.navRow}>
          {navItems.slice(0, 2).map((item) => (
            <NavLink
              key={item.path}
              active={isActive(item.path)}
              icon={item.icon}
              label={item.label}
              onPress={() => handleNavPress(item)}
            />
          ))}

          <View style={styles.fabSlot} ref={fabRef}>
            <TouchableOpacity
              accessibilityLabel={t('nav.createHabit')}
              activeOpacity={0.85}
              onPress={onCreate}
              style={[
                styles.fabButton,
                {
                  backgroundColor: colors.primary,
                  borderColor: colors.background,
                  shadowColor: colors.primary,
                },
              ]}
            >
              <Plus size={20} color={colors.white} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {navItems.slice(2).map((item) => (
            <NavLink
              key={item.path}
              active={isActive(item.path)}
              icon={item.icon}
              label={item.label}
              onPress={() => handleNavPress(item)}
            />
          ))}
        </View>
      </View>
    </View>
  )
}

interface NavLinkProps {
  active: boolean
  icon: typeof Home
  label: string
  onPress: () => void
}

function NavLink({ active, icon: Icon, label, onPress }: Readonly<NavLinkProps>) {
  const { nav } = useAppTheme()
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current

  useEffect(() => {
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [active, progress])

  const iconScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  })
  const labelOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.76, 1],
  })
  const labelTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -1],
  })
  const indicatorScaleX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  })

  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.75}
      onPress={onPress}
      style={styles.navItem}
    >
      <Animated.View style={{ transform: [{ scale: iconScale }] }}>
        <Icon
          color={active ? nav.activeColor : nav.inactiveColor}
          size={22}
          strokeWidth={2}
        />
      </Animated.View>
      <Animated.Text
        style={[
          styles.navLabel,
          {
            color: active ? nav.activeColor : nav.inactiveColor,
            opacity: labelOpacity,
            transform: [{ translateY: labelTranslateY }],
          },
        ]}
      >
        {label}
      </Animated.Text>
      <Animated.View
        style={[
          styles.activeIndicator,
          {
            backgroundColor: nav.activeColor,
            opacity: progress,
            transform: [{ scaleX: indicatorScaleX }],
          },
        ]}
      />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  navGlass: {
    borderTopWidth: 1,
    paddingHorizontal: 20,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 80,
    position: 'relative',
  },
  navItem: {
    alignItems: 'center',
    gap: 4,
    minWidth: 48,
    paddingVertical: 8,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 0,
    width: 16,
    height: 2,
    borderRadius: 999,
  },
  fabSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -28,
  },
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
})
