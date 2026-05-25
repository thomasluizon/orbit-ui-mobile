import { useMemo, useRef } from 'react'
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderHandlers,
} from 'react-native'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { AppBar } from '@/components/ui/app-bar'
import { SaturnDropcap } from '@/components/ui/saturn-dropcap'
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

/** v8 AppBar + streak/bell utility cluster for the Today screen. */
export function TodayHeader({
  currentStreak,
  onGoToToday,
  goToTodayLabel,
  dateLong,
}: Readonly<{
  currentStreak: number
  onGoToToday: () => void
  goToTodayLabel: string
  dateLong: string
}>) {
  const streakRef = useRef<View>(null)
  const bellRef = useRef<View>(null)
  useTourTarget('tour-streak-badge', streakRef)
  useTourTarget('tour-notification-bell', bellRef)

  return (
    <Pressable
      onPress={onGoToToday}
      accessibilityRole="button"
      accessibilityLabel={goToTodayLabel}
    >
      <AppBar
        LeadingIcon={SaturnDropcap}
        title="Orbit"
        subtitle={dateLong}
        trailing={
          <>
            <ThemeToggle />
            <View ref={streakRef} collapsable={false}>
              <StreakBadge streak={currentStreak} />
            </View>
            <View ref={bellRef} collapsable={false}>
              <NotificationBell />
            </View>
          </>
        }
      />
    </Pressable>
  )
}

/** v8 chip strip used as the Today/All/General/Goals view switcher. */
export function TodayTabs({
  tabs,
  activeView,
  onChangeView,
  viewsLabel: _viewsLabel,
}: Readonly<{
  tabs: TodayTabItem[]
  activeView: TodayTabView
  onChangeView: (view: TodayTabView) => void
  viewsLabel: string
}>) {
  const tabsRef = useRef<View>(null)
  const goalsTabRef = useRef<View>(null)
  useTourTarget('tour-tabs-bar', tabsRef)
  useTourTarget('tour-goals-tab', goalsTabRef)

  // Single chip-strip — preserves the chip semantics through `Chip` primitive.
  // The two refs are required so the tour engine can locate the tab strip and
  // the goals tab specifically. `goalsTabRef` is attached to a wrapper around
  // the chip strip's "Goals" position.
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
      <View style={[styles.datePill, { borderColor: tokens.hairlineStrong }]}>
        <Pressable
          onPress={onGoToPreviousDay}
          accessibilityRole="button"
          accessibilityLabel={previousLabel}
          hitSlop={8}
          style={styles.dateChevron}
        >
          <ChevronLeft size={16} color={tokens.fg2} strokeWidth={1.6} />
        </Pressable>
        <Pressable
          onPress={onGoToToday}
          accessibilityRole="button"
          accessibilityLabel={isTodaySelected ? dateLabel : todayLabel}
          style={styles.dateLabelPress}
        >
          <Animated.Text
            style={[
              styles.dateLabel,
              {
                color: isTodaySelected ? tokens.primary : tokens.fg1,
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
          style={styles.dateChevron}
        >
          <ChevronRight size={16} color={tokens.fg2} strokeWidth={1.6} />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  dateNavWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 10,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 4,
  },
  dateChevron: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateLabelPress: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  dateLabel: {
    fontFamily: 'Geist',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.1,
    textAlign: 'center',
    minWidth: 110,
  },
})

// Legacy TodayShellStyles type is retained for compatibility with any
// imports that still reference it, though all the styles are now contained
// in the new primitives. Consumers should no longer reach for these fields.
export type TodayShellStyles = Record<string, never>
