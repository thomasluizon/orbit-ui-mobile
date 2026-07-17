import { useCallback, useMemo, useRef } from 'react'
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  canLogHabitOnDate,
  computeHabitCardStatus,
  computeHabitFrequencyLabel,
  formatAPIDate,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { useTimeFormat } from '@/hooks/use-time-format'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { AnchoredMenu, useAnchoredMenu } from '@/components/ui/anchored-menu'
import { HabitRowContent } from './habit-row-content'
import { HabitRowLeading } from './habit-row-leading'
import { HabitRowTrailing } from './habit-row-trailing'
import { HabitRowMenuBody } from './habit-row-menu'
import {
  buildHabitRowAccessibilityLabel,
  buildHabitRowMetaParts,
  hasHabitRowMenuActions,
  resolveHabitRowDotState,
} from './habit-row-model'
import { styles } from './habit-row-styles'

/**
 * Action callbacks consumed by HabitRow.
 */
export interface HabitRowActions {
  onLog?: () => void
  onUnlog?: () => void
  onSkip?: () => void
  onReschedule?: () => void
  onDelete?: () => void
  onDuplicate?: () => void
  onEdit?: () => void
  onMoveParent?: () => void
  onDetail?: () => void
  onDrillInto?: () => void
  onToggleSelection?: () => void
  onAddSubHabit?: () => void
  onToggleExpand?: () => void
  onForceLogParent?: () => void
  onEnterSelectMode?: () => void
  onLongPressCard?: () => void
}

const EMPTY_HABIT_ROW_ACTIONS: HabitRowActions = {}

interface HabitRowProps {
  habit: NormalizedHabit
  selectedDate?: Date
  /** 0 = top-level row, >0 = sub-habit row: indent + smaller well + dimmer text
   *  carry the hierarchy. No connector lines (#539). */
  depth?: number
  isSelectMode?: boolean
  isSelected?: boolean
  hasChildren?: boolean
  isExpanded?: boolean
  /** True when this row draws the top edge of its tonal panel (top border +
   *  top corner radii). A single-row panel has both first and last true. */
  firstInPanel?: boolean
  /** True when this row draws the bottom edge of its tonal panel (bottom border,
   *  bottom corner radii, and the gap to the next panel). */
  lastInPanel?: boolean
  /** True to show the violet drill chevron (open in focus) instead of the grey
   *  expand chevron: used for sub-habits and drill cards past level 2 (#539). */
  showDrillChevron?: boolean
  childrenDone?: number
  childrenTotal?: number
  actions?: HabitRowActions
  style?: StyleProp<ViewStyle>
}

/**
 * Habit row: emoji · title · inline meta · trailing status dot.
 */
// react-doctor-disable-next-line no-many-boolean-props -- private row-internal component; the flags are independent render inputs from the parent list, not a combinatorial public API https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function HabitRow({
  habit,
  selectedDate,
  depth = 0,
  isSelectMode = false,
  isSelected = false,
  hasChildren = false,
  isExpanded = false,
  firstInPanel = true,
  lastInPanel = true,
  showDrillChevron = false,
  childrenDone = 0,
  childrenTotal = 0,
  actions = EMPTY_HABIT_ROW_ACTIONS,
  style,
}: Readonly<HabitRowProps>) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { displayTime } = useTimeFormat()

  const isChild = depth > 0
  const todayStr = formatAPIDate(new Date())
  const selectedDateStr = formatAPIDate(selectedDate ?? new Date())

  const isDoneForRange = habit.isCompleted || habit.isLoggedInRange
  const status = useMemo(
    () => computeHabitCardStatus(habit, selectedDate),
    [habit, selectedDate],
  )

  const frequencyLabel = useMemo(
    () => computeHabitFrequencyLabel(habit, t),
    [habit, t],
  )

  const isOverdue = status === 'overdue'
  const canLog = canLogHabitOnDate(habit, selectedDateStr, todayStr)

  const metaParts = buildHabitRowMetaParts({
    habit,
    frequencyLabel,
    isOverdue,
    selectedDateStr,
    todayStr,
    displayTime,
    t,
    locale,
  })

  const streak = habit.currentStreak ?? 0
  const showStreak = streak >= 2 && !isChild && !isSelectMode

  const dotState = resolveHabitRowDotState(isDoneForRange, habit.isBadHabit, isOverdue)

  const emoji = habit.emoji

  const {
    anchorRef: menuButtonRef,
    visible: menuVisible,
    anchorRect: menuAnchorRect,
    open: openAnchoredMenu,
    close: closeAnchoredMenu,
  } = useAnchoredMenu()
  const menuActivityAt = useRef(0)

  const hasMenuActions = hasHabitRowMenuActions(actions, isSelectMode, hasChildren)

  const openMenu = useCallback(() => {
    menuActivityAt.current = Date.now()
    openAnchoredMenu()
  }, [openAnchoredMenu])

  const closeMenu = useCallback(() => {
    menuActivityAt.current = Date.now()
    closeAnchoredMenu()
  }, [closeAnchoredMenu])

  const handlePress = () => {
    if (Date.now() - menuActivityAt.current < 500) return
    if (isSelectMode) {
      actions.onToggleSelection?.()
    } else {
      actions.onDetail?.()
    }
  }

  const handleToggleStatus = () => {
    if (isDoneForRange) {
      actions.onUnlog?.()
    } else {
      actions.onLog?.()
    }
  }

  const titleSize = isChild ? 14 : 16
  const emojiSize = isChild ? 16 : 22
  const wellSize = isChild ? 36 : 46
  const wellRadius = isChild ? 12 : 14

  const titleColor = isDoneForRange ? tokens.fg3 : tokens.fg1

  const linkedGoal = (habit.linkedGoals?.length ?? 0) > 0

  const rowAccessibilityLabel = useMemo(
    () =>
      buildHabitRowAccessibilityLabel({
        title: habit.title,
        dotState,
        linkedGoal,
        showStreak,
        streak,
        t,
      }),
    // react-doctor-disable-next-line exhaustive-deps -- streak is the extracted habit.currentStreak and already listed; the analyzer wants the qualified member path but the alias tracks it https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    [habit.title, dotState, linkedGoal, showStreak, streak, t],
  )

  const indentPx = depth * 16

  return (
    <View style={style}>
      <Pressable
        onPress={handlePress}
        onLongPress={
          isSelectMode ? undefined : actions.onLongPressCard
        }
        delayLongPress={300}
        accessibilityRole="button"
        accessibilityLabel={rowAccessibilityLabel}
        style={({ pressed }) => {
          const pressedBackground = pressed ? tokens.bgElevPressed : tokens.bgCard
          return [
            styles.row,
            {
              backgroundColor: isSelected ? tokens.bgSunk : pressedBackground,
              borderColor: pressed ? tokens.hairlineStrong : tokens.hairline,
              borderLeftWidth: 1,
              borderRightWidth: 1,
              borderTopWidth: firstInPanel ? 1 : 0,
              borderBottomWidth: lastInPanel ? 1 : 0,
              borderTopLeftRadius: firstInPanel ? 18 : 0,
              borderTopRightRadius: firstInPanel ? 18 : 0,
              borderBottomLeftRadius: lastInPanel ? 18 : 0,
              borderBottomRightRadius: lastInPanel ? 18 : 0,
              marginLeft: 20,
              marginRight: 20,
              marginBottom: lastInPanel ? 10 : 0,
              paddingLeft: 16 + indentPx,
            },
            pressed ? styles.rowPressed : null,
          ]
        }}
      >
        <HabitRowLeading
          habitTitle={habit.title}
          emoji={emoji}
          emojiSize={emojiSize}
          wellSize={wellSize}
          wellRadius={wellRadius}
          isSelectMode={isSelectMode}
          isSelected={isSelected}
          hasChildren={hasChildren}
          isExpanded={isExpanded}
          showDrillChevron={showDrillChevron}
          onToggleSelection={actions.onToggleSelection}
          onToggleExpand={actions.onToggleExpand}
          onDrillInto={actions.onDrillInto}
          tokens={tokens}
        />

        <HabitRowContent
          habit={habit}
          titleSize={titleSize}
          titleColor={titleColor}
          isDoneForRange={isDoneForRange}
          metaParts={metaParts}
          showStreak={showStreak}
          streak={streak}
          tokens={tokens}
        />

        <HabitRowTrailing
          habit={habit}
          isSelectMode={isSelectMode}
          hasChildren={hasChildren}
          childrenDone={childrenDone}
          childrenTotal={childrenTotal}
          linkedGoal={linkedGoal}
          isDoneForRange={isDoneForRange}
          canLog={canLog}
          dotState={dotState}
          hasMenuActions={hasMenuActions}
          menuButtonRef={menuButtonRef}
          actions={actions}
          tokens={tokens}
          onToggleStatus={handleToggleStatus}
          onOpenMenu={openMenu}
          onMenuActivity={() => {
            menuActivityAt.current = Date.now()
          }}
        />
      </Pressable>

      {hasMenuActions ? (
        <AnchoredMenu
          visible={menuVisible}
          anchorRect={menuAnchorRect}
          onClose={closeMenu}
          width={208}
          estimatedHeight={hasChildren ? 340 : 296}
        >
          <HabitRowMenuBody
            actions={actions}
            hasChildren={hasChildren}
            isSelectMode={isSelectMode}
            close={closeMenu}
            t={t}
            tokens={tokens}
          />
        </AnchoredMenu>
      ) : null}
    </View>
  )
}
