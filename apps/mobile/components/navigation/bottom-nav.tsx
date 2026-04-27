import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { Pressable } from 'react-native-gesture-handler'
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
import { useAppTheme } from '@/lib/use-app-theme'
import { mobileMotion, useResolvedMotionPreset } from '@/lib/motion'
import { useUIStore } from '@/stores/ui-store'

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
  const { colors, nav, currentTheme, surfaces } = useAppTheme()
  const goToTodayDate = useUIStore((s) => s.goToToday)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const isLight = currentTheme === 'light'
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
        goToTodayDate()
        setActiveView('today')
      }

      if (isActive(item.path)) {
        return
      }

      router.navigate(item.path)
    },
    [goToTodayDate, isActive, router, setActiveView],
  )

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}> 
      <View
        style={[
          styles.navGlass,
          {
            backgroundColor: surfaces.overlay.backgroundColor,
            borderTopColor: nav.tabBarBorder,
            elevation: surfaces.overlay.elevation,
            ...surfaces.overlay.shadow,
          },
          isLight ? styles.navGlassLight : null,
        ]}
      >
        <BlurView
          intensity={isLight ? 60 : 48}
          tint={isLight ? 'light' : 'dark'}
          experimentalBlurMethod="dimezisBlurView"
          style={[StyleSheet.absoluteFill, styles.blurFill]}
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: nav.tabBarBg, opacity: isLight ? 0.85 : 0.7 },
          ]}
        />
        <View style={styles.navRow} accessibilityRole="tablist">
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
            <Pressable
              accessibilityLabel={t('nav.createHabit')}
              accessibilityRole="button"
              accessibilityState={{ disabled: !onCreate }}
              disabled={!onCreate}
              hitSlop={8}
              onPress={onCreate}
              style={({ pressed }) => [
                styles.fabButton,
                {
                  backgroundColor: colors.primary,
                  borderColor: surfaces.screen.backgroundColor,
                  opacity: pressed ? 0.9 : 1,
                  shadowColor: colors.primary,
                  transform: [
                    {
                      translateY: pressed
                        ? mobileMotion.orbital.elevatedPress.translateY
                        : 0,
                    },
                    {
                      scale: pressed
                        ? mobileMotion.orbital.elevatedPress.scale
                        : 1,
                    },
                  ],
                },
              ]}
            >
              <Plus size={20} color={colors.white} strokeWidth={2.5} />
            </Pressable>
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
  const { colors, nav, radius } = useAppTheme()
  const tabMotion = useResolvedMotionPreset('tab-switch')
  const [focused, setFocused] = useState(false)
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current

  useEffect(() => {
    const easing = active ? tabMotion.enterEasing : tabMotion.exitEasing

    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: active ? tabMotion.enterDuration : tabMotion.exitDuration,
      easing: Easing.bezier(easing[0], easing[1], easing[2], easing[3]),
      useNativeDriver: true,
    }).start()
  }, [active, progress, tabMotion])

  const activeIconScale = tabMotion.reducedMotionEnabled ? 1 : 1.08
  const activeLabelOffset = tabMotion.reducedMotionEnabled ? 0 : -1

  const iconScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, activeIconScale],
  })
  const labelOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.76, 1],
  })
  const labelTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, activeLabelOffset],
  })
  const indicatorScaleX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  })

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      hitSlop={6}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.navItem,
        {
          backgroundColor: active || focused ? colors.primary_10 : 'transparent',
          borderRadius: radius.md,
          opacity: pressed ? 0.86 : 1,
          transform: tabMotion.reducedMotionEnabled
            ? undefined
            : [
                {
                  translateY: pressed ? mobileMotion.orbital.press.translateY : 0,
                },
                { scale: pressed ? mobileMotion.orbital.press.scale : 1 },
              ],
        },
      ]}
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
    </Pressable>
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
    overflow: 'hidden',
  },
  navGlassLight: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.055,
    shadowRadius: 10,
    elevation: 2,
  },
  blurFill: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
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
    justifyContent: 'center',
    gap: 4,
    minHeight: 48,
    minWidth: 56,
    paddingHorizontal: 6,
    paddingVertical: 8,
    position: 'relative',
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '500',
    lineHeight: 12,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 3,
    width: 18,
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
