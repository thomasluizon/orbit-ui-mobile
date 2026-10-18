import type { ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HABIT_FREQUENCY_FILTER_OPTIONS, toggleHabitFrequencyFilter } from '@orbit/shared/utils/habit-frequency-filter'
import { useUIStore } from '@/stores/ui-store'
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { MoreVertical, ChevronLeft, ChevronRight, Search } from '@/components/ui/icons'
import { Menu, MenuAnchorHost, useAnchoredMenu } from '@/components/ui/menu'
import { PillButton } from '@/components/ui/pill-button'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { DestinationHeaderRow } from '@/components/navigation/root-notification-header'
import { useShellHeaderSlot } from '@/components/shell/shell-header-slot'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface TodayDateControlProps {
  showDate?: boolean
  beforeDate?: ReactNode
  menuHeading?: string
  shortDayName?: string
  headerActive?: boolean
  dayName: string
  numericDate: string
  isTodaySelected: boolean
  nextDisabled: boolean
  previousLabel: string
  todayLabel: string
  goToTodayLabel: string
  nextLabel: string
  moreLabel: string
  selectLabel: string
  collapseLabel: string
  allCollapsed: boolean
  refreshLabel: string
  completedLabel: string
  showCompleted: boolean
  isFetching: boolean
  onToggleSelect: () => void
  onToggleCollapse: () => void
  onRefresh: () => void
  onToggleCompleted: () => void
  onGoToPreviousDay: () => void
  onGoToToday: () => void
  onGoToNextDay: () => void
  searchLabel: string
  searchOpen?: boolean
  onSearch: () => void
}

function TodayHeaderActions(props: Readonly<TodayDateControlProps>) {
  const { t } = useTranslation()
  const frequencyUnit = useUIStore((state) => state.activeFilters.frequencyUnit)
  const setFilters = useUIStore((state) => state.setFilters)
  const [frequencyMenu, setFrequencyMenu] = useState(false)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const menu = useAnchoredMenu()
  return <DestinationHeaderRow testID="today-header-actions" gap={4} wrap>
    {props.showDate !== false && !props.isTodaySelected ? <PillButton variant="ghost" size="sm" minimumHeight={48}
      accessibleName={props.goToTodayLabel} onClick={props.onGoToToday}>{props.todayLabel}</PillButton> : null}
    <View style={styles.spacer} />
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel={props.searchLabel} accessibilityState={{ expanded: props.searchOpen }} onPress={props.onSearch}
        style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: tokens.bgHover }]}>
        <Search size={20} color={tokens.fg2} />
      </Pressable>
      <MenuAnchorHost anchorRef={menu.anchorRef}>
        <Pressable accessibilityRole="button" accessibilityLabel={props.moreLabel}
          accessibilityState={{ expanded: menu.visible }} onPress={() => { setFrequencyMenu(false); menu.toggle() }}
          style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: tokens.bgHover }]}>
          <MoreVertical size={20} strokeWidth={1.8} color={tokens.fg2} />
        </Pressable>
      </MenuAnchorHost>
      <NotificationBell />
    </View>
    <Menu key={frequencyMenu ? 'frequency' : 'options'} open={menu.visible} anchorRef={menu.anchorRef}
      title={frequencyMenu ? t('habits.frequencyFilter') : props.moreLabel}
      shortTitle={frequencyMenu ? t('common.options') : props.menuHeading}
      items={frequencyMenu ? HABIT_FREQUENCY_FILTER_OPTIONS.map((option) => ({
        id: option.id, label: t(option.labelKey), checked: frequencyUnit === option.value,
      })) : [
        { id: 'select', label: props.selectLabel, icon: 'checkbox' },
        { id: 'collapse', label: props.collapseLabel, icon: props.allCollapsed ? 'chevrons-down' : 'chevrons-up' },
        { id: 'refresh', label: props.refreshLabel, icon: 'refresh', disabled: props.isFetching },
        { id: 'completed', label: props.completedLabel, icon: props.showCompleted ? 'eye-off' : 'eye' },
        { id: 'frequency', label: t('habits.frequencyFilter'), icon: 'adjustments-horizontal' },
      ]}
      onClose={menu.close} onSelect={(id) => {
        if (frequencyMenu) setFilters({ frequencyUnit: toggleHabitFrequencyFilter(frequencyUnit, id) })
        else if (id === 'frequency') { setFrequencyMenu(true); menu.open() }
        else if (id === 'select') props.onToggleSelect()
        else if (id === 'collapse') props.onToggleCollapse()
        else if (id === 'refresh') props.onRefresh()
        else if (id === 'completed') props.onToggleCompleted()
      }} />
  </DestinationHeaderRow>
}

export function TodayDateControl(props: Readonly<TodayDateControlProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { width, fontScale } = useWindowDimensions()
  const header = <TodayHeaderActions {...props} />
  const hosted = useShellHeaderSlot(props.headerActive ?? true, header)
  const dayName = width / fontScale < 240 ? props.shortDayName ?? props.dayName : props.dayName
  return <>
    {!hosted ? header : null}
    {props.beforeDate}
    {props.showDate !== false ? <View testID="today-date-row" style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={props.previousLabel} onPress={props.onGoToPreviousDay}
        style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: tokens.bgHover }]}>
        <ChevronLeft size={20} strokeWidth={1.8} color={tokens.fg2} />
      </Pressable>
      <View accessible accessibilityLabel={`${props.dayName}, ${props.numericDate}`} style={styles.dateText}>
        <Text style={[styles.dayName, { color: tokens.fg1 }]}>{dayName}</Text>
        <Text style={[styles.numericDate, { color: tokens.fg3 }]}>{props.numericDate}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={props.nextLabel}
        accessibilityState={{ disabled: props.nextDisabled }} disabled={props.nextDisabled} onPress={props.onGoToNextDay}
        style={({ pressed }) => [styles.iconButton, pressed && !props.nextDisabled && { backgroundColor: tokens.bgHover }, props.nextDisabled && styles.disabled]}>
        <ChevronRight size={20} strokeWidth={1.8} color={tokens.fg2} />
      </Pressable>
    </View> : null}
  </>
}

const styles = StyleSheet.create({
  spacer: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 56, paddingVertical: 4 },
  iconButton: { alignItems: 'center', borderRadius: 999, overflow: 'hidden', minHeight: 48, justifyContent: 'center', width: 48, flexShrink: 0 },
  dateText: { minWidth: 0, alignItems: 'center', flexGrow: 1, flexShrink: 1 },
  dayName: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 22, letterSpacing: -0.44, textAlign: 'center' },
  numericDate: { fontFamily: 'GeistMono_400Regular', fontSize: 12, letterSpacing: 0.24, fontVariant: ['tabular-nums'], textAlign: 'center' },
  disabled: { opacity: 0.5 },
})
