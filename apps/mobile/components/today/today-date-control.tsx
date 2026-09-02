import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronLeft, ChevronRight, MoreVertical } from '@/components/ui/icons'
import { Menu, MenuAnchorHost, useAnchoredMenu } from '@/components/ui/menu'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface TodayDateControlProps {
  dayName: string
  numericDate: string
  isTodaySelected: boolean
  nextDisabled: boolean
  previousLabel: string
  todayLabel: string
  nextLabel: string
  moreLabel: string
  selectLabel: string
  collapseLabel: string
  refreshLabel: string
  completedLabel: string
  isFetching: boolean
  onToggleSelect: () => void
  onToggleCollapse: () => void
  onRefresh: () => void
  onToggleCompleted: () => void
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
  moreLabel,
  selectLabel,
  collapseLabel,
  refreshLabel,
  completedLabel,
  isFetching,
  onToggleSelect,
  onToggleCollapse,
  onRefresh,
  onToggleCompleted,
  onGoToPreviousDay,
  onGoToToday,
  onGoToNextDay,
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
      <View style={styles.dateText}>
        <Text numberOfLines={1} style={[styles.dayName, { color: tokens.fg1 }]}>{dayName}</Text>
        <Text numberOfLines={1} style={[styles.numericDate, { color: tokens.fg3 }]}>{numericDate}</Text>
      </View>
      {!isTodaySelected ? (
        <Pressable
          accessibilityRole="button"
          onPress={onGoToToday}
          style={({ pressed }) => [
            styles.todayButton,
            pressed ? { backgroundColor: tokens.bgHover } : null,
          ]}
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
          <MoreVertical size={20} strokeWidth={1.8} color={tokens.fg2} />
        </Pressable>
      </MenuAnchorHost>
      <Menu
        open={menu.visible}
        anchorRef={menu.anchorRef}
        title={moreLabel}
        items={[
          { id: 'select', label: selectLabel },
          { id: 'collapse', label: collapseLabel },
          { id: 'refresh', label: refreshLabel, disabled: isFetching },
          { id: 'completed', label: completedLabel },
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
    gap: 8,
    minHeight: 53,
    paddingHorizontal: 16,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  dateText: {
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
    borderRadius: 8,
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
