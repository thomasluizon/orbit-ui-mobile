import { useMemo, useRef } from 'react'
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderHandlers,
} from 'react-native'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { SectionHeadTabs, type SectionHeadTab } from '@/components/ui/section-head-tabs'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { StreakBadge } from '@/components/gamification/streak-badge'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { useTourTarget } from '@/hooks/use-tour-target'
import { useResolvedMotionPreset } from '@/lib/motion'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export type TodayTabView = 'today' | 'all' | 'general' | 'goals'

export type TodayTabItem = {
  view: TodayTabView
  label: string
}

/** Início header: the date as the heading over the gradient, with the theme
 *  toggle, streak flame, and notification bell clustered top-right. */
export function TodayHeader({
  currentStreak,
  onGoToToday,
  goToTodayLabel,
  dateLine,
  topInset,
}: Readonly<{
  currentStreak: number
  onGoToToday: () => void
  goToTodayLabel: string
  dateLine: string
  topInset: number
}>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const streakRef = useRef<View>(null)
  const bellRef = useRef<View>(null)
  useTourTarget('tour-streak-badge', streakRef)
  useTourTarget('tour-notification-bell', bellRef)

  return (
    <Pressable
      onPress={onGoToToday}
      accessibilityRole="button"
      accessibilityLabel={goToTodayLabel}
      style={[styles.greetingRow, { paddingTop: topInset + 12 }]}
    >
      <View style={styles.greetingBlock}>
        <Text
          style={[styles.greetingDate, { color: tokens.fg1 }]}
          numberOfLines={1}
        >
          {dateLine}
        </Text>
      </View>
      <View style={styles.greetingActions}>
        <ThemeToggle />
        <View ref={streakRef} collapsable={false}>
          <StreakBadge streak={currentStreak} />
        </View>
        <View ref={bellRef} collapsable={false}>
          <NotificationBell />
        </View>
      </View>
    </Pressable>
  )
}

/** Kit pill-chip strip used as the Today/All/General/Goals view switcher. */
export function TodayTabs({
  tabs,
  activeView,
  hasProAccess,
  onChangeView,
  viewsLabel: _viewsLabel,
}: Readonly<{
  tabs: TodayTabItem[]
  activeView: TodayTabView
  hasProAccess: boolean
  onChangeView: (view: TodayTabView) => void
  viewsLabel: string
}>) {
  const tabsRef = useRef<View>(null)
  const goalsTabRef = useRef<View>(null)
  useTourTarget('tour-tabs-bar', tabsRef)
  useTourTarget('tour-goals-tab', goalsTabRef)

  const chipTabs = useMemo<SectionHeadTab<TodayTabView>[]>(
    () =>
      tabs.map((tab) => ({
        id: tab.view,
        label: tab.label,
        locked: tab.view === 'goals' && !hasProAccess,
      })),
    [tabs, hasProAccess],
  )

  return (
    <View ref={tabsRef} collapsable={false}>
      <View ref={goalsTabRef} collapsable={false}>
        <SectionHeadTabs
          tabs={chipTabs}
          active={activeView}
          onChange={onChangeView}
        />
      </View>
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
  panHandlers?: GestureResponderHandlers
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
  panHandlers,
}: Readonly<TodayDateNavigationProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const dateNavRef = useRef<View>(null)
  const dateMotion = useResolvedMotionPreset('tab-switch')
  const dateLabelEnterShift = dateMotion.reducedMotionEnabled
    ? 0
    : slideDirection === 'left'
      ? -12
      : 12
  useTourTarget('tour-date-nav', dateNavRef)

  if (!visible) return null

  return (
    <View
      ref={dateNavRef}
      style={styles.dateNavWrap}
      collapsable={false}
      {...panHandlers}
    >
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
          <ChevronLeft size={18} color={tokens.fg2} strokeWidth={1.8} />
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
          <ChevronRight size={18} color={tokens.fg2} strokeWidth={1.8} />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
  },
  greetingBlock: {
    flex: 1,
    minWidth: 0,
  },
  greetingDate: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 18,
    letterSpacing: -0.18,
  },
  greetingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
  },
  dateNavWrap: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 10,
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
    transform: [{ scale: 0.92 }],
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
})
