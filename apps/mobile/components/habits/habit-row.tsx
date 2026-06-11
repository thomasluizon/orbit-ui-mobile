import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  FastForward,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  type LucideIcon,
} from 'lucide-react-native'
import {
  canLogHabitOnDate,
  computeHabitCardStatus,
  computeHabitFrequencyLabel,
  computeHabitFutureHint,
  formatAPIDate,
  stripInlineMarkdown,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { useTimeFormat } from '@/hooks/use-time-format'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { AnchoredMenu } from '@/components/ui/anchored-menu'
import type { MenuAnchorRect } from '@/lib/anchored-menu'
import { ParentRing } from '@/components/ui/parent-ring'
import { SelectCheck } from '@/components/ui/select-check'
import type { StatusDotState } from '@/components/ui/status-dot'

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

  const metaParts: (
    | string
    | { kind: 'overdue' }
    | { kind: 'future'; label: string }
  )[] = []
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

  const dotState: StatusDotState = isOverdue
    ? 'overdue'
    : isDoneForRange
      ? 'done'
      : habit.isBadHabit
        ? 'bad'
        : 'empty'

  const emoji = habit.emoji

  const menuButtonRef = useRef<View>(null)
  const [menuVisible, setMenuVisible] = useState(false)
  const [menuAnchorRect, setMenuAnchorRect] = useState<MenuAnchorRect | null>(
    null,
  )
  const menuActivityAt = useRef(0)

  const hasMenuActions =
    !!actions.onEdit ||
    !!actions.onDuplicate ||
    !!actions.onMoveParent ||
    !!actions.onAddSubHabit ||
    !!actions.onSkip ||
    !!actions.onDelete ||
    (!isSelectMode && !!actions.onEnterSelectMode) ||
    (hasChildren && !!actions.onDrillInto)

  const openMenu = useCallback(() => {
    menuActivityAt.current = Date.now()
    menuButtonRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchorRect({ x, y, width, height })
      setMenuVisible(true)
    })
  }, [])

  const closeMenu = useCallback(() => {
    menuActivityAt.current = Date.now()
    setMenuVisible(false)
  }, [])

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
        accessibilityLabel={habit.title}
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

        <View style={styles.titleBlock}>
          <Text
            numberOfLines={2}
            style={[
              styles.title,
              {
                fontSize: titleSize,
                color: titleColor,
                textDecorationLine: isDoneForRange ? 'line-through' : 'none',
                textDecorationColor: tokens.fg4,
              },
            ]}
          >
            {habit.title}
          </Text>

          {habit.description?.trim() ? (
            <Text
              numberOfLines={1}
              style={[styles.description, { color: tokens.fg3 }]}
            >
              {stripInlineMarkdown(habit.description)}
            </Text>
          ) : null}

          {metaParts.length > 0 || showStreak ? (
            <Text
              numberOfLines={1}
              style={[styles.meta, { color: tokens.fg3 }]}
            >
              {metaParts.map((part, i) => (
                <Fragment key={i}>
                  {i > 0 ? (
                    <Text style={{ color: tokens.fg4 }}> · </Text>
                  ) : null}
                  {typeof part === 'string' ? (
                    part
                  ) : part.kind === 'future' ? (
                    part.label
                  ) : (
                    <Text
                      style={{
                        fontFamily: 'Rubik_500Medium',
                        color: tokens.statusOverdue,
                      }}
                    >
                      {t('habits.overdue')}
                    </Text>
                  )}
                </Fragment>
              ))}
              {showStreak ? (
                <Text style={{ color: tokens.statusOverdue }}>
                  {metaParts.length > 0 ? '  ' : ''}🔥 {streak}
                </Text>
              ) : null}
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
              <>
                <Text style={[styles.childProgressText, { color: tokens.fg3 }]}>
                  {childrenDone}/{childrenTotal}
                </Text>
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
                  hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                  accessibilityRole="button"
                  accessibilityLabel={`${habit.title} ${childrenDone}/${childrenTotal}`}
                >
                  <ParentRing
                    done={childrenDone}
                    total={childrenTotal}
                    size={30}
                    color={habit.isBadHabit ? tokens.statusBad : undefined}
                    trackColor={
                      habit.isBadHabit ? `${tokens.statusBad}66` : undefined
                    }
                  />
                </Pressable>
              </>
            ) : (
              <CheckCircle
                state={dotState}
                tone={habit.isBadHabit ? 'bad' : 'default'}
                onToggle={handleToggleStatus}
                disabled={!canLog && !isDoneForRange}
                accessibilityLabel={
                  isDoneForRange
                    ? t('habits.actions.unlog')
                    : t('habits.logHabit')
                }
                tokens={tokens}
              />
            )
          ) : null}
          {!isSelectMode && hasMenuActions ? (
            <View ref={menuButtonRef} collapsable={false}>
              <Pressable
                onPressIn={() => {
                  menuActivityAt.current = Date.now()
                }}
                onPress={openMenu}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('habits.actions.more')}
                style={({ pressed }) => [
                  styles.menuButton,
                  pressed ? { backgroundColor: tokens.bgElevPressed } : null,
                ]}
              >
                <MoreVertical
                  size={18}
                  color={tokens.fg3}
                  strokeWidth={1.8}
                />
              </Pressable>
            </View>
          ) : null}
        </View>
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

const CHECK_FILLED_STATES: ReadonlySet<StatusDotState> = new Set([
  'done',
  'skip',
  'frozen',
])

interface CheckCircleProps {
  state: StatusDotState
  /** 'bad' fills the logged circle in statusBad instead of statusDone. */
  tone?: 'default' | 'bad'
  onToggle: () => void
  disabled: boolean
  accessibilityLabel: string
  tokens: ReturnType<typeof createTokensV2>
}

function CheckCircle({
  state,
  tone = 'default',
  onToggle,
  disabled,
  accessibilityLabel,
  tokens,
}: Readonly<CheckCircleProps>) {
  const colorMap: Record<StatusDotState, string> = {
    done: tokens.statusDone,
    empty: tokens.statusEmpty,
    skip: tokens.statusSkip,
    overdue: tokens.statusOverdue,
    bad: tokens.statusBad,
    frozen: tokens.statusFrozen,
  }
  const filled = CHECK_FILLED_STATES.has(state)
  const color =
    tone === 'bad' && state === 'done' ? tokens.statusBad : colorMap[state]

  const popScale = useSharedValue(1)
  const previousFilled = useRef(filled)

  useEffect(() => {
    if (filled && !previousFilled.current) {
      popScale.value = withSequence(
        withSpring(1.18, { damping: 14 }),
        withSpring(1),
      )
    }
    previousFilled.current = filled
  }, [filled, popScale])

  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: popScale.value }],
  }))

  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        transform: [{ scale: pressed && !disabled ? 0.9 : 1 }],
      })}
    >
      <Animated.View
        style={[
          styles.checkCircle,
          {
            backgroundColor: filled ? color : 'transparent',
            borderWidth: filled ? 0 : 2,
            borderColor: filled ? 'transparent' : color,
          },
          filled && state === 'done'
            ? {
                shadowColor: tone === 'bad' ? tokens.statusBad : tokens.primary,
                shadowOpacity: 0.35,
                shadowRadius: 7,
                shadowOffset: { width: 0, height: 3 },
                elevation: 3,
              }
            : null,
          popStyle,
        ]}
      >
        {filled ? (
          <Check size={17} color={tokens.fgOnPrimary} strokeWidth={3} />
        ) : null}
      </Animated.View>
    </Pressable>
  )
}

interface HabitRowMenuBodyProps {
  actions: HabitRowActions
  hasChildren: boolean
  isSelectMode: boolean
  close: () => void
  t: (key: string) => string
  tokens: ReturnType<typeof createTokensV2>
}

function HabitRowMenuBody({
  actions,
  hasChildren,
  isSelectMode,
  close,
  t,
  tokens,
}: Readonly<HabitRowMenuBodyProps>) {
  const run = (handler?: () => void) => () => {
    close()
    handler?.()
  }

  const canSelect = !isSelectMode && !!actions.onEnterSelectMode
  const canDrillInto = hasChildren && !!actions.onDrillInto

  return (
    <>
      {actions.onAddSubHabit ? (
        <MenuItem
          icon={Plus}
          label={t('habits.form.addSubHabit')}
          color={tokens.fg1}
          onPress={run(actions.onAddSubHabit)}
        />
      ) : null}
      {actions.onMoveParent ? (
        <MenuItem
          icon={ArrowRight}
          label={t('habits.moveParent.button')}
          color={tokens.fg1}
          onPress={run(actions.onMoveParent)}
        />
      ) : null}
      {actions.onSkip ? (
        <MenuItem
          icon={FastForward}
          label={t('habits.actions.skip')}
          color={tokens.statusOverdue}
          onPress={run(actions.onSkip)}
        />
      ) : null}
      {actions.onEdit ? (
        <MenuItem
          icon={Pencil}
          label={t('common.edit')}
          color={tokens.fg1}
          onPress={run(actions.onEdit)}
        />
      ) : null}
      {actions.onDuplicate ? (
        <MenuItem
          icon={Copy}
          label={t('habits.actions.duplicate')}
          color={tokens.fg1}
          onPress={run(actions.onDuplicate)}
        />
      ) : null}
      {canSelect ? (
        <MenuItem
          icon={CheckCircle2}
          label={t('common.select')}
          color={tokens.fg1}
          onPress={run(actions.onEnterSelectMode)}
        />
      ) : null}
      {actions.onDelete ? (
        <>
          <View
            style={[styles.menuDivider, { backgroundColor: tokens.hairline }]}
          />
          <MenuItem
            icon={Trash2}
            label={t('habits.deleteHabit')}
            color={tokens.statusBad}
            onPress={run(actions.onDelete)}
          />
        </>
      ) : null}
      {canDrillInto ? (
        <MenuItem
          icon={ChevronRight}
          label={t('habits.actions.openSubHabits')}
          color={tokens.fg1}
          onPress={run(actions.onDrillInto)}
        />
      ) : null}
    </>
  )
}

interface MenuItemProps {
  icon: LucideIcon
  label: string
  color: string
  onPress: () => void
}

function MenuItem({ icon: Icon, label, color, onPress }: Readonly<MenuItemProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      style={({ pressed }) => [
        styles.menuItem,
        { backgroundColor: pressed ? tokens.bgElevPressed : 'transparent' },
      ]}
    >
      <Icon size={16} color={color} strokeWidth={1.8} />
      <Text style={[styles.menuItemLabel, { color }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 18,
    borderWidth: 1,
    position: 'relative',
  },
  rowPressed: {
    transform: [{ scale: 0.99 }],
  },
  emojiWell: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontFamily: 'Rubik_500Medium',
    letterSpacing: -0.08,
    lineHeight: 21,
  },
  meta: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  description: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    lineHeight: 17,
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
  childProgressText: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  checkCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    margin: -3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
  },
  menuItemLabel: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
    marginHorizontal: 8,
  },
})
