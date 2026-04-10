import { useRef } from 'react'
import { Animated, Image, Text, TouchableOpacity, View, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { StreakBadge } from '@/components/gamification/streak-badge'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { useTourTarget } from '@/hooks/use-tour-target'

export type TodayTabView = 'today' | 'all' | 'general' | 'goals'

export type TodayTabItem = {
  view: TodayTabView
  label: string
}

export type TodayShellStyles = {
  header: ViewStyle
  logoRow: ViewStyle
  logoIcon: ViewStyle
  logoImage: ImageStyle
  headerTitle: TextStyle
  headerRight: ViewStyle
  tabsWrapper: ViewStyle
  tabsRow: ViewStyle
  tab: ViewStyle
  tabActive: ViewStyle
  tabText: TextStyle
  tabTextActive: TextStyle
  dateNav: ViewStyle
  dateNavButton: ViewStyle
  dateLabel: TextStyle
  dateLabelToday: TextStyle
}

export function TodayHeader({
  currentStreak,
  onGoToToday,
  goToTodayLabel,
  styles,
}: {
  currentStreak: number
  onGoToToday: () => void
  goToTodayLabel: string
  styles: TodayShellStyles
}) {
  const streakRef = useRef<View>(null)
  const bellRef = useRef<View>(null)
  useTourTarget('tour-streak-badge', streakRef)
  useTourTarget('tour-notification-bell', bellRef)

  return (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.logoRow}
        onPress={onGoToToday}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={goToTodayLabel}
      >
        <View style={styles.logoIcon}>
          <Image
            source={require('../../assets/logo-no-bg.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.headerTitle}>Orbit</Text>
      </TouchableOpacity>

      <View style={styles.headerRight}>
        <ThemeToggle />
        <View ref={streakRef}><StreakBadge streak={currentStreak} /></View>
        <View ref={bellRef}><NotificationBell /></View>
      </View>
    </View>
  )
}

export function TodayTabs({
  tabs,
  activeView,
  onChangeView,
  viewsLabel,
  styles,
}: {
  tabs: TodayTabItem[]
  activeView: TodayTabView
  onChangeView: (view: TodayTabView) => void
  viewsLabel: string
  styles: TodayShellStyles
}) {
  const tabsRef = useRef<View>(null)
  const goalsTabRef = useRef<View>(null)
  useTourTarget('tour-tabs-bar', tabsRef)
  useTourTarget('tour-goals-tab', goalsTabRef)

  return (
    <View style={styles.tabsWrapper} ref={tabsRef}>
      <View
        style={styles.tabsRow}
        accessibilityRole="tablist"
        accessibilityLabel={viewsLabel}
      >
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.view}
            ref={tab.view === 'goals' ? goalsTabRef : undefined}
            style={[styles.tab, activeView === tab.view && styles.tabActive]}
            onPress={() => onChangeView(tab.view)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeView === tab.view }}
          >
            <Text
              style={[
                styles.tabText,
                activeView === tab.view && styles.tabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

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
  iconColor,
  styles,
  dateLabelAnim,
}: {
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
  iconColor: string
  styles: TodayShellStyles
  dateLabelAnim: Animated.Value
}) {
  const dateNavRef = useRef<View>(null)
  useTourTarget('tour-date-nav', dateNavRef)

  if (!visible) return null

  return (
    <View style={styles.dateNav} ref={dateNavRef}>
      <TouchableOpacity
        style={styles.dateNavButton}
        onPress={onGoToPreviousDay}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={previousLabel}
      >
        <ChevronLeft size={20} color={iconColor} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onGoToToday}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={isTodaySelected ? dateLabel : todayLabel}
      >
        <Animated.Text
          style={[
            styles.dateLabel,
            isTodaySelected && styles.dateLabelToday,
            {
              opacity: dateLabelAnim,
              transform: [
                {
                  translateX: dateLabelAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [slideDirection === 'left' ? -12 : 12, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {dateLabel}
        </Animated.Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.dateNavButton}
        onPress={onGoToNextDay}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={nextLabel}
      >
        <ChevronRight size={20} color={iconColor} />
      </TouchableOpacity>
    </View>
  )
}
