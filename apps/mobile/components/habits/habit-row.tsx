import { Fragment, useCallback, useMemo, useRef, useState } from 'react'
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
import {
  ArrowRight,
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
  computeHabitCardStatus,
  computeHabitFrequencyLabel,
  resolveHabitEmoji,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { useTimeFormat } from '@/hooks/use-time-format'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { AnchoredMenu } from '@/components/ui/anchored-menu'
import type { MenuAnchorRect } from '@/lib/anchored-menu'
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
  childrenDone?: number
  childrenTotal?: number
  actions?: HabitRowActions
  style?: StyleProp<ViewStyle>
}

/**
 * Habit row: emoji · title · inline meta · trailing status dot.
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

  const menuButtonRef = useRef<View>(null)
  const [menuVisible, setMenuVisible] = useState(false)
  const [menuAnchorRect, setMenuAnchorRect] = useState<MenuAnchorRect | null>(
    null,
  )
  // Android nested-Pressable quirk: tapping the kebab can also fire the row's
  // onPress. Stamping a timestamp on every menu interaction (open + close)
  // lets handlePress swallow row presses that race the kebab/menu-item taps.
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

  const titleSize = isChild ? 14 : 17
  const emojiSize = isChild ? 16 : 18

  const titleColor = isDoneForRange ? tokens.fg3 : tokens.fg1

  const linkedGoal = (habit.linkedGoals?.length ?? 0) > 0

  // Every habit row is its own fully-rounded --bg-elev card. Hierarchy comes
  // from the left indent (16px per depth level), not from shared containers.
  // 6px gap below each row gives breathing room without hairlines.
  // 20px horizontal margin matches the screen header's gutter.
  const indentPx = depth * 16

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
            paddingLeft: 16,
            backgroundColor: isSelected
              ? tokens.bgSunk
              : pressed
                ? tokens.bgElevPressed
                : tokens.bgElev,
            borderRadius: 10,
            marginLeft: 20 + indentPx,
            marginRight: 20,
            marginBottom: 6,
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
                    size={22}
                  />
                </Pressable>
              </>
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
                  size={16}
                  color={tokens.fg3}
                  strokeWidth={1.5}
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
    </Animated.View>
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
      <Icon size={16} color={color} strokeWidth={1.6} />
      <Text style={[styles.menuItemLabel, { color }]}>{label}</Text>
    </Pressable>
  )
}

// Tokens are consumed via inline styles for dynamic theming; static styles
// below contain no color values.
const styles = StyleSheet.create({
  row: {
    paddingRight: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    position: 'relative',
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontFamily: 'Geist',
    fontWeight: '400',
    letterSpacing: -0.08,
    lineHeight: 21,
  },
  meta: {
    fontFamily: 'Geist',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
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
    fontFamily: 'GeistMono',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  streak: {
    fontFamily: 'GeistMono',
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    minWidth: 18,
    textAlign: 'right',
  },
  menuButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
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
    fontFamily: 'Geist',
    fontSize: 14,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
    marginHorizontal: 8,
  },
})
