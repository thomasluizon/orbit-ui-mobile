import { useMemo, useRef } from 'react'
import {
  // react-doctor-disable-next-line rn-prefer-reanimated -- Deliberate React Native Animated API; migrating to reanimated risks the pinned worklets 0.10.0 / reanimated 4.5.0 ABI (SDK 57) and would require rewriting the shared lib/motion.ts Animated helpers + cross-component Animated.Value props. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { GestureDetector, type PanGesture } from 'react-native-gesture-handler'
import { ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { AppLogo } from '@/components/ui/app-logo'
import { SectionHeadTabs, type SectionHeadTab } from '@/components/ui/section-head-tabs'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { StreakBadge } from '@/components/gamification/streak-badge'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { useProfile } from '@/hooks/use-profile'
import { useStreakInfo } from '@/hooks/use-gamification'
import { useTourTarget } from '@/hooks/use-tour-target'
import { useResolvedMotionPreset } from '@/lib/motion'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export type TodayTabView = 'today' | 'all' | 'general'

export type TodayTabItem = {
  view: TodayTabView
  label: string
}

/** Início header: the Orbit mark over the gradient, with the theme toggle,
 *  streak flame, and notification bell clustered top-right. */
export function TodayHeader({
  currentStreak,
  onGoToToday,
  goToTodayLabel,
  topInset,
}: Readonly<{
  currentStreak: number
  onGoToToday: () => void
  goToTodayLabel: string
  topInset: number
}>) {
  const streakRef = useRef<View>(null)
  const bellRef = useRef<View>(null)
  useTourTarget('tour-streak-badge', streakRef)
  useTourTarget('tour-notification-bell', bellRef)
  const { profile } = useProfile()
  const { data: streakInfo } = useStreakInfo(profile?.canViewGamification ?? false)

  return (
    <Pressable
      onPress={onGoToToday}
      accessibilityRole="button"
      accessibilityLabel={goToTodayLabel}
      style={[styles.greetingRow, { paddingTop: topInset + 12 }]}
    >
      <View style={styles.greetingBlock}>
        <AppLogo size={28} />
      </View>
      <View style={styles.greetingActions}>
        <ThemeToggle />
        <View ref={streakRef} collapsable={false}>
          <StreakBadge streak={currentStreak} isFrozen={streakInfo?.isFrozenToday ?? false} />
        </View>
        <View ref={bellRef} collapsable={false}>
          <NotificationBell />
        </View>
      </View>
    </Pressable>
  )
}

/** Kit pill-chip strip used as the Today, All and General view switcher. */
export function TodayTabs({
  tabs,
  activeView,
  onChangeView,
  viewsLabel,
}: Readonly<{
  tabs: TodayTabItem[]
  activeView: TodayTabView
  onChangeView: (view: TodayTabView) => void
  viewsLabel: string
}>) {
  const tabsRef = useRef<View>(null)
  useTourTarget('tour-tabs-bar', tabsRef)

  const chipTabs = useMemo<SectionHeadTab<TodayTabView>[]>(
    () =>
      tabs.map((tab) => ({
        id: tab.view,
        label: tab.label,
      })),
    [tabs],
  )

  return (
    <View ref={tabsRef} collapsable={false}>
      <SectionHeadTabs
        tabs={chipTabs}
        active={activeView}
        onChange={onChangeView}
        ariaLabel={viewsLabel}
      />
    </View>
  )
}

interface TodayDateNavigationProps {
  visible: boolean
  dateLabel: string
  isTodaySelected: boolean
  slideDirection: 'left' | 'right'
  onGoToPreviousDay: () => void
  onGoToToday: () => void
  onGoToNextDay: () => void
  previousLabel: string
  todayLabel: string
  nextLabel: string
  dateLabelAnim: Animated.Value
  swipeGesture?: PanGesture
}

/** v8 inline ◂  date  ▸ navigation pinned under the section tabs. */
export function TodayDateNavigation({
  visible,
  dateLabel,
  isTodaySelected,
  slideDirection,
  onGoToPreviousDay,
  onGoToToday,
  onGoToNextDay,
  previousLabel,
  todayLabel,
  nextLabel,
  dateLabelAnim,
  swipeGesture,
}: Readonly<TodayDateNavigationProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const dateNavRef = useRef<View>(null)
  const dateMotion = useResolvedMotionPreset('tab-switch')
  const enterShiftDirection = slideDirection === 'left' ? -12 : 12
  const dateLabelEnterShift = dateMotion.reducedMotionEnabled ? 0 : enterShiftDirection
  useTourTarget('tour-date-nav', dateNavRef)

  if (!visible) return null

  const dateNav = (
    <View ref={dateNavRef} style={styles.dateNavWrap} collapsable={false}>
      <View style={styles.datePill}>
        <Pressable
          onPress={onGoToPreviousDay}
          accessibilityRole="button"
          accessibilityLabel={previousLabel}
          hitSlop={8}
          style={({ pressed }) => [
            styles.dateChevron,
            pressed
              ? [styles.dateChevronPressed, { backgroundColor: tokens.bgElev }]
              : null,
          ]}
        >
          <ChevronLeft size={20} color={tokens.fg2} strokeWidth={1.8} />
        </Pressable>
        <Pressable
          onPress={onGoToToday}
          accessibilityRole="button"
          accessibilityLabel={isTodaySelected ? dateLabel : todayLabel}
          style={({ pressed }) => [
            styles.dateLabelPress,
            pressed
              ? [styles.dateLabelPressed, { backgroundColor: tokens.bgElev }]
              : null,
          ]}
        >
          <Animated.Text
            style={[
              styles.dateLabel,
              {
                color: tokens.primary,
                opacity: dateLabelAnim,
                transform: [
                  {
                    translateX: dateLabelAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [dateLabelEnterShift, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {dateLabel}
          </Animated.Text>
        </Pressable>
        <Pressable
          onPress={onGoToNextDay}
          accessibilityRole="button"
          accessibilityLabel={nextLabel}
          hitSlop={8}
          style={({ pressed }) => [
            styles.dateChevron,
            pressed
              ? [styles.dateChevronPressed, { backgroundColor: tokens.bgElev }]
              : null,
          ]}
        >
          <ChevronRight size={20} color={tokens.fg2} strokeWidth={1.8} />
        </Pressable>
      </View>
    </View>
  )

  if (!swipeGesture) return dateNav

  return <GestureDetector gesture={swipeGesture}>{dateNav}</GestureDetector>
}

interface TodayDateControlProps {
  dayName: string
  numericDate: string
  isTodaySelected: boolean
  nextDisabled: boolean
  previousLabel: string
  todayLabel: string
  nextLabel: string
  onGoToPreviousDay: () => void
  onGoToToday: () => void
  onGoToNextDay: () => void
}

export function TodayDateControl({
  dayName,
  numericDate,
  isTodaySelected,
  nextDisabled,
  previousLabel,
  todayLabel,
  nextLabel,
  onGoToPreviousDay,
  onGoToToday,
  onGoToNextDay,
}: Readonly<TodayDateControlProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View style={styles.dateControlRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={previousLabel}
        onPress={onGoToPreviousDay}
        style={styles.dateControlIconButton}
      >
        <ChevronLeft size={20} strokeWidth={1.8} color={tokens.fg2} />
      </Pressable>
      <View style={styles.dateControlText}>
        <Text numberOfLines={1} style={[styles.dayName, { color: tokens.fg1 }]}>{dayName}</Text>
        <Text numberOfLines={1} style={[styles.numericDate, { color: tokens.fg3 }]}>{numericDate}</Text>
      </View>
      {!isTodaySelected ? (
        <Pressable
          accessibilityRole="button"
          onPress={onGoToToday}
          style={styles.todayButton}
        >
          <Text style={[styles.todayText, { color: tokens.fg1 }]}>{todayLabel}</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={nextLabel}
        accessibilityState={{ disabled: nextDisabled }}
        disabled={nextDisabled}
        onPress={onGoToNextDay}
        style={[styles.dateControlIconButton, nextDisabled ? styles.disabled : null]}
      >
        <ChevronRight size={20} strokeWidth={1.8} color={tokens.fg2} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  greetingBlock: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  greetingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
  },
  dateNavWrap: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  dateChevron: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateChevronPressed: {
    transform: [{ scale: 0.96 }],
  },
  dateLabelPress: {
    flex: 1,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateLabelPressed: {
    transform: [{ scale: 0.98 }],
  },
  dateLabel: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 15,
    textAlign: 'center',
  },
  dateControlRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 53,
    paddingHorizontal: 16,
  },
  dateControlIconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  dateControlText: {
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  dayName: {
    fontFamily: 'Geist_500Medium',
    fontSize: 14,
  },
  numericDate: {
    fontFamily: 'RobotoMono_400Regular',
    fontSize: 12,
  },
  todayButton: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  todayText: {
    fontFamily: 'Geist_500Medium',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  disabled: {
    opacity: 0.5,
  },
})
