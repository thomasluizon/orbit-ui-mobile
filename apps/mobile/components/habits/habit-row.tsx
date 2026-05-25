import { Fragment, useMemo } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react-native'
import {
  computeHabitCardStatus,
  computeHabitFrequencyLabel,
  resolveHabitEmoji,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { useTimeFormat } from '@/hooks/use-time-format'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ParentRing } from '@/components/ui/parent-ring'
import { SelectCheck } from '@/components/ui/select-check'
import { StatusDot, type StatusDotState } from '@/components/ui/status-dot'

/**
 * Action callbacks consumed by HabitRow.
 */
export interface HabitRowActions {
  onLog?: () => void
  onUnlog?: () => void
  onSkip?: () => void
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
  /** Last child in a parent group — vertical tree line stops at midpoint. */
  isLastChild?: boolean
  childrenDone?: number
  childrenTotal?: number
  actions?: HabitRowActions
  style?: StyleProp<ViewStyle>
}

/**
 * Habit row: emoji · title · inline meta · trailing status dot.
 * Renders a tree-line connector for child rows.
 *
 * IMPORTANT: the root is a bare `Animated.View` from `react-native-reanimated`.
 * Stripping this wrapper regresses `@gorhom/bottom-sheet` modals on Android
 * (their `present()` silently no-ops). See `apps/mobile/lib/providers.tsx`
 * for the provider-level stabilizer; this row-level wrap is the per-card
 * piece of the same workaround. Do not "simplify" it.
 */
export function HabitRow({
  habit,
  selectedDate,
  depth = 0,
  isSelectMode = false,
  isSelected = false,
  hasChildren = false,
  isExpanded = false,
  isLastChild = false,
  childrenDone = 0,
  childrenTotal = 0,
  actions = {},
  style,
}: Readonly<HabitRowProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { displayTime } = useTimeFormat()

  const isChild = depth > 0

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

  const metaParts: (string | { kind: 'overdue' | 'bad' })[] = []
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
  if (isOverdue && !isChild) metaParts.push({ kind: 'overdue' })
  if (habit.isBadHabit && !isChild) metaParts.push({ kind: 'bad' })

  const streak = habit.currentStreak ?? 0
  const showStreak = streak >= 2 && !isChild && !isSelectMode

  const dotState: StatusDotState = isOverdue
    ? 'overdue'
    : habit.isBadHabit
      ? 'bad'
      : isDoneForRange
        ? 'done'
        : 'empty'

  const emoji = resolveHabitEmoji(habit.emoji)

  const handlePress = () => {
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

  const titleSize = isChild ? 14 : 17
  const emojiSize = isChild ? 16 : 18

  const titleColor = isDoneForRange ? tokens.fg3 : tokens.fg1

  const linkedGoal = (habit.linkedGoals?.length ?? 0) > 0

  // Every habit row is a --bg-elev card. Parent + expanded children share one
  // card via radius (parent top-rounded, last child bottom-rounded, middles
  // square). Standalones get a fully rounded card. Whitespace below separates
  // adjacent blocks — no internal or inter-row hairlines.
  const isGroupStart = hasChildren && isExpanded && !isChild
  const isGroupEnd = isChild && isLastChild
  const closesBlock = !isChild && !isGroupStart

  return (
    // Bare Animated.View stabilizer for @gorhom/bottom-sheet on Android.
    // See JSDoc above and memory `project_animated_view_gorhom.md`.
    <Animated.View style={style}>
      <Pressable
        onPress={handlePress}
        onLongPress={
          isSelectMode ? undefined : actions.onLongPressCard
        }
        delayLongPress={300}
        accessibilityRole="button"
        accessibilityLabel={habit.title}
        style={({ pressed }) => [
          styles.row,
          {
            paddingTop: 12,
            paddingBottom: 12,
            paddingLeft: 20,
            backgroundColor: isSelected
              ? tokens.bgSunk
              : pressed
                ? tokens.bgSunk
                : tokens.bgElev,
            borderTopLeftRadius: isGroupStart || closesBlock ? 10 : 0,
            borderTopRightRadius: isGroupStart || closesBlock ? 10 : 0,
            borderBottomLeftRadius: isGroupEnd || closesBlock ? 10 : 0,
            borderBottomRightRadius: isGroupEnd || closesBlock ? 10 : 0,
            marginBottom: closesBlock || isGroupEnd ? 8 : 0,
          },
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
            <ChevronDown size={14} color={tokens.fg3} strokeWidth={1.5} />
          </Pressable>
        ) : null}

        {emoji ? (
          <Text style={{ fontSize: emojiSize, lineHeight: emojiSize + 2 }}>
            {emoji}
          </Text>
        ) : null}

        <View style={styles.titleBlock}>
          <Text
            numberOfLines={1}
            style={[
              styles.title,
              {
                fontSize: titleSize,
                color: titleColor,
                textDecorationLine: isDoneForRange ? 'line-through' : 'none',
                textDecorationColor: tokens.hairlineStrong,
              },
            ]}
          >
            {habit.title}
          </Text>

          {metaParts.length > 0 ? (
            <Text
              numberOfLines={1}
              style={[styles.meta, { color: tokens.fg3 }]}
            >
              <Text style={{ color: tokens.fg4 }}> · </Text>
              {metaParts.map((part, i) => (
                <Fragment key={i}>
                  {i > 0 ? (
                    <Text style={{ color: tokens.fg4 }}> · </Text>
                  ) : null}
                  {typeof part === 'string' ? (
                    part
                  ) : (
                    <Text style={{ fontStyle: 'italic' }}>
                      {(part.kind === 'overdue'
                        ? t('habits.overdue')
                        : t('habits.badHabit')
                      ).toLowerCase()}
                    </Text>
                  )}
                </Fragment>
              ))}
            </Text>
          ) : null}
        </View>

        <View style={styles.trailing}>
          {linkedGoal ? (
            <View
              style={[
                styles.linkedGoalDot,
                { backgroundColor: tokens.primary },
              ]}
            />
          ) : null}
          {!isSelectMode ? (
            hasChildren && childrenTotal > 0 ? (
              <Pressable
                onPress={() => {
                  if (isDoneForRange) {
                    actions.onUnlog?.()
                  } else if (childrenDone >= childrenTotal) {
                    actions.onLog?.()
                  } else {
                    actions.onForceLogParent?.()
                  }
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`${habit.title} ${childrenDone}/${childrenTotal}`}
              >
                <ParentRing
                  done={childrenDone}
                  total={childrenTotal}
                  size={14}
                />
              </Pressable>
            ) : (
              <StatusDot
                state={dotState}
                size={22}
                onToggle={handleToggleStatus}
                accessibilityLabel={
                  isDoneForRange
                    ? t('habits.actions.unlog')
                    : t('habits.logHabit')
                }
              />
            )
          ) : null}
          {showStreak ? (
            <Text
              style={[styles.streak, { color: tokens.fg2 }]}
            >
              {streak}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  )
}

// Tokens are consumed via inline styles for dynamic theming; static styles
// below contain no color values.
const styles = StyleSheet.create({
  row: {
    paddingRight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    position: 'relative',
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  title: {
    fontFamily: 'Geist',
    fontWeight: '400',
    letterSpacing: -0.08,
    lineHeight: 21,
    flexShrink: 1,
    minWidth: 0,
  },
  meta: {
    fontFamily: 'Geist',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  linkedGoalDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  streak: {
    fontFamily: 'GeistMono',
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    minWidth: 18,
    textAlign: 'right',
  },
})
