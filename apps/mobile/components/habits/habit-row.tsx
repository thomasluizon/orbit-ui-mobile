import { useCallback, useMemo, useRef } from 'react'
import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react-native'
import {
  canLogHabitOnDate,
  computeHabitCardStatus,
  computeHabitFrequencyLabel,
  computeHabitFutureHint,
  formatAPIDate,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { useTimeFormat } from '@/hooks/use-time-format'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { AnchoredMenu, useAnchoredMenu } from '@/components/ui/anchored-menu'
import { SelectCheck } from '@/components/ui/select-check'
import type { StatusDotState } from '@/components/ui/status-dot'
import { HabitRowContent, type HabitRowMetaPart } from './habit-row-content'
import { HabitRowTrailing } from './habit-row-trailing'
import { HabitRowMenuBody } from './habit-row-menu'
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

interface HabitRowProps {
  habit: NormalizedHabit
  selectedDate?: Date
  /** 0 = parent row, >0 = child row (renders tree line connector). */
  depth?: number
  isSelectMode?: boolean
  isSelected?: boolean
  hasChildren?: boolean
  isExpanded?: boolean
  childrenDone?: number
  childrenTotal?: number
  actions?: HabitRowActions
  style?: StyleProp<ViewStyle>
}

/**
 * Habit row: emoji · title · inline meta · trailing status dot.
 */
export function HabitRow({
  habit,
  selectedDate,
  depth = 0,
  isSelectMode = false,
  isSelected = false,
  hasChildren = false,
  isExpanded = false,
  childrenDone = 0,
  childrenTotal = 0,
  actions = {},
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

  const metaParts: HabitRowMetaPart[] = []
  if (!habit.isGeneral && frequencyLabel) metaParts.push(frequencyLabel)
  if (habit.dueTime) {
    const due = displayTime(habit.dueTime)
    metaParts.push(
      habit.dueEndTime ? `${due} - ${displayTime(habit.dueEndTime)}` : due,
    )
  }
  if (habit.checklistItems && habit.checklistItems.length > 0) {
    const checked = habit.checklistItems.filter((i) => i.isChecked).length
    metaParts.push(`${checked}/${habit.checklistItems.length}`)
  }
  if (isOverdue) metaParts.push({ kind: 'overdue' })
  if (!habit.isCompleted && selectedDateStr === todayStr) {
    const futureHint = computeHabitFutureHint(habit, todayStr, t, locale)
    if (futureHint) metaParts.push({ kind: 'future', label: futureHint })
  }

  const streak = habit.currentStreak ?? 0
  const showStreak = streak >= 2 && !isChild && !isSelectMode

  const dotState: StatusDotState = isDoneForRange
    ? 'done'
    : habit.isBadHabit
      ? 'bad'
      : isOverdue
        ? 'overdue'
        : 'empty'

  const emoji = habit.emoji

  const {
    anchorRef: menuButtonRef,
    visible: menuVisible,
    anchorRect: menuAnchorRect,
    open: openAnchoredMenu,
    close: closeAnchoredMenu,
  } = useAnchoredMenu()
  const menuActivityAt = useRef(0)

  const hasMenuActions =
    !!actions.onEdit ||
    !!actions.onDuplicate ||
    !!actions.onMoveParent ||
    !!actions.onAddSubHabit ||
    !!actions.onSkip ||
    !!actions.onReschedule ||
    !!actions.onDelete ||
    (!isSelectMode && !!actions.onEnterSelectMode) ||
    (hasChildren && !!actions.onDrillInto)

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

  const rowAccessibilityLabel = useMemo(() => {
    const parts = [habit.title, t(`habits.statusDot.${dotState}` as const)]
    if (linkedGoal) parts.push(t('habits.detail.linkedGoal'))
    if (showStreak) parts.push(`🔥 ${streak}`)
    return parts.join(', ')
  }, [habit.title, dotState, linkedGoal, showStreak, streak, t])

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
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: isSelected
              ? tokens.bgSunk
              : pressed
                ? tokens.bgElevPressed
                : tokens.bgCard,
            borderColor: pressed ? tokens.hairlineStrong : tokens.hairline,
            marginLeft: 20 + indentPx,
            marginRight: 20,
            marginBottom: 10,
          },
          pressed ? styles.rowPressed : null,
        ]}
      >
        {isSelectMode ? (
          <SelectCheck
            selected={isSelected}
            onPress={actions.onToggleSelection}
            accessibilityLabel={t('common.select')}
          />
        ) : null}

        {hasChildren && !isSelectMode ? (
          <Pressable
            onPress={actions.onToggleExpand}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={
              isExpanded ? t('common.collapse') : t('common.expand')
            }
            style={{
              transform: [{ rotate: isExpanded ? '0deg' : '-90deg' }],
            }}
          >
            <ChevronDown size={14} color={tokens.fg3} strokeWidth={1.8} />
          </Pressable>
        ) : null}

        <View
          style={[
            styles.emojiWell,
            {
              width: wellSize,
              height: wellSize,
              borderRadius: wellRadius,
              backgroundColor: tokens.bgField,
            },
          ]}
        >
          {emoji ? (
            <Text style={{ fontSize: emojiSize, lineHeight: emojiSize + 2 }}>
              {emoji}
            </Text>
          ) : (
            <Text
              style={{
                fontSize: emojiSize - 4,
                lineHeight: emojiSize + 2,
                color: tokens.fg3,
                fontFamily: 'Rubik_500Medium',
              }}
            >
              {[...habit.title.trim().toUpperCase()][0]}
            </Text>
          )}
        </View>

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
