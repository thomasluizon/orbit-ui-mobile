import { Pressable, StyleSheet, Text, View } from 'react-native'
import { AdjustmentsHorizontal, ChevronLeft, ChevronRight, Search } from '@/components/ui/icons'
import { Menu, MenuAnchorHost, useAnchoredMenu } from '@/components/ui/menu'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface TodayDateControlProps {
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
  onSearch: () => void
}

export function TodayDateControl({
  dayName,
  numericDate,
  isTodaySelected,
  nextDisabled,
  previousLabel,
  todayLabel,
  goToTodayLabel,
  nextLabel,
  moreLabel,
  selectLabel,
  collapseLabel,
  allCollapsed,
  refreshLabel,
  completedLabel,
  showCompleted,
  isFetching,
  onToggleSelect,
  onToggleCollapse,
  onRefresh,
  onToggleCompleted,
  onGoToPreviousDay,
  onGoToToday,
  onGoToNextDay,
  searchLabel,
  onSearch,
}: Readonly<TodayDateControlProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const menu = useAnchoredMenu()
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={previousLabel}
        onPress={onGoToPreviousDay}
        style={({ pressed }) => [
          styles.iconButton,
          pressed ? { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] } : null,
        ]}
      >
        <ChevronLeft size={20} strokeWidth={1.8} color={tokens.fg2} />
      </Pressable>
      <View accessible accessibilityLabel={`${dayName}, ${numericDate}`} style={styles.dateText}>
        <Text style={[styles.dayName, { color: tokens.fg1 }]}>{dayName}</Text>
        <Text style={[styles.numericDate, { color: tokens.fg3 }]}>{numericDate}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={nextLabel}
        accessibilityState={{ disabled: nextDisabled }}
        disabled={nextDisabled}
        onPress={onGoToNextDay}
        style={({ pressed }) => [
          styles.iconButton,
          pressed && !nextDisabled
            ? { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] }
            : null,
          nextDisabled ? styles.disabled : null,
        ]}
      >
        <ChevronRight size={20} strokeWidth={1.8} color={tokens.fg2} />
      </Pressable>
      {!isTodaySelected ? (
        <PillButton variant="ghost" size="sm" accessibleName={goToTodayLabel} onClick={onGoToToday}>
          {todayLabel}
        </PillButton>
      ) : null}
      <MenuAnchorHost anchorRef={menu.anchorRef}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={moreLabel}
          accessibilityState={{ expanded: menu.visible }}
          onPress={menu.toggle}
          style={({ pressed }) => [
            styles.iconButton,
            pressed ? { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] } : null,
          ]}
        >
          <AdjustmentsHorizontal size={20} strokeWidth={1.8} color={tokens.fg2} />
        </Pressable>
      </MenuAnchorHost>
      <Pressable accessibilityRole="button" accessibilityLabel={searchLabel} onPress={onSearch}
        style={({ pressed }) => [styles.iconButton, pressed ? { backgroundColor: tokens.bgHover } : null]}>
        <Search size={20} color={tokens.fg1} />
      </Pressable>
      <Menu
        open={menu.visible}
        anchorRef={menu.anchorRef}
        title={moreLabel}
        items={[
          { id: 'select', label: selectLabel, icon: 'checkbox' },
          { id: 'collapse', label: collapseLabel, icon: allCollapsed ? 'chevrons-down' : 'chevrons-up' },
          { id: 'refresh', label: refreshLabel, icon: 'refresh', disabled: isFetching },
          { id: 'completed', label: completedLabel, icon: showCompleted ? 'eye-off' : 'eye' },
        ]}
        onClose={menu.close}
        onSelect={(id) => {
          if (id === 'select') onToggleSelect()
          else if (id === 'collapse') onToggleCollapse()
          else if (id === 'refresh') onRefresh()
          else if (id === 'completed') onToggleCompleted()
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'flex-end',
    minHeight: 53,
    paddingHorizontal: 0,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  dateText: {
    alignItems: 'flex-start',
    flexBasis: 'auto',
    flexGrow: 1,
    flexShrink: 0,
    maxWidth: '100%',
    minWidth: 0,
  },
  dayName: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 22,
    letterSpacing: -0.44,
    textAlign: 'left',
  },
  numericDate: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 12,
    letterSpacing: 0.24,
    fontVariant: ['tabular-nums'],
    textAlign: 'left',
  },
  disabled: {
    opacity: 0.5,
  },
})
