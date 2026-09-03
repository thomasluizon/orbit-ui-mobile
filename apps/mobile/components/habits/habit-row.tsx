import { useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  canLogHabitOnDate,
  computeHabitCardStatus,
  computeHabitFrequencyLabel,
  formatAPIDate,
  getTodayBoundary,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { MenuItem } from '@orbit/shared/contracts/overlay'
import { useTimeFormat } from '@/hooks/use-time-format'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { Menu, useAnchoredMenu } from '@/components/ui/menu'
import { ChevronDown } from '@/components/ui/icons'
import { SelectCheck } from '@/components/ui/select-check'
import { HabitRowContent } from './habit-row-content'
import { HabitRowLeading } from './habit-row-leading'
import { HabitRowTrailing } from './habit-row-trailing'
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
  onEnterSelectMode?: () => void
  onLongPressCard?: () => void
}

const EMPTY_HABIT_ROW_ACTIONS: HabitRowActions = {}

function buildMenuItems(
  actions: HabitRowActions,
  isSelectMode: boolean,
  completionReadOnly: boolean,
  hasProAccess: boolean,
  t: (key: string) => string,
): MenuItem[] {
  const items: MenuItem[] = []
  if (actions.onAddSubHabit) items.push({ id: 'add', label: t('habits.form.addSubHabit'), badge: hasProAccess ? undefined : 'Pro' })
  if (actions.onMoveParent) items.push({ id: 'move', label: t('habits.moveParent.button') })
  if (actions.onSkip && !completionReadOnly) items.push({ id: 'skip', label: t('habits.actions.skip') })
  if (actions.onReschedule && !completionReadOnly) items.push({ id: 'reschedule', label: t('habits.actions.reschedule') })
  if (actions.onEdit) items.push({ id: 'edit', label: t('common.edit') })
  if (actions.onDuplicate) items.push({ id: 'duplicate', label: t('habits.actions.duplicate') })
  if (actions.onEnterSelectMode && !isSelectMode) {
    items.push({ id: 'select', label: t('common.select') })
  }
  if (actions.onDrillInto) items.push({ id: 'drill', label: t('habits.actions.openSubHabits') })
  if (actions.onDelete) {
    items.push({ id: 'delete', label: t('habits.deleteHabit'), destructive: true })
  }
  return items
}

function runMenuAction(actions: HabitRowActions, id: string): void {
  const handlers: Record<string, (() => void) | undefined> = {
    add: actions.onAddSubHabit,
    move: actions.onMoveParent,
    skip: actions.onSkip,
    reschedule: actions.onReschedule,
    edit: actions.onEdit,
    duplicate: actions.onDuplicate,
    select: actions.onEnterSelectMode,
    drill: actions.onDrillInto,
    delete: actions.onDelete,
  }
  handlers[id]?.()
}

interface HabitRowProps {
  habit: NormalizedHabit
  selectedDate?: Date
  /** Two inline display levels. Deeper data descendants are clamped to level 1 by the list. */
  depth?: 0 | 1
  isSelectMode?: boolean
  isSelected?: boolean
  hasChildren?: boolean
  isExpanded?: boolean
  readOnly?: boolean
  childrenDone?: number
  childrenTotal?: number
  actions?: HabitRowActions
  style?: StyleProp<ViewStyle>
  panelStart?: boolean
  panelEnd?: boolean
  hasProAccess?: boolean
}

function HabitRowStructuralColumn({
  selectMode,
  selected,
  title,
  hasChildren,
  expanded,
  actions,
  tokens,
  collapseLabel,
  expandLabel,
  readOnly,
}: Readonly<{
  selectMode: boolean
  selected: boolean
  title: string
  hasChildren: boolean
  expanded: boolean
  actions: HabitRowActions
  tokens: ReturnType<typeof createTokensV2>
  collapseLabel: string
  expandLabel: string
  readOnly: boolean
}>) {
  if (selectMode) {
    return (
      <View style={styles.structuralColumn}>
        <SelectCheck
          selected={selected}
          onPress={actions.onToggleSelection}
          accessibilityLabel={title}
          disabled={readOnly}
          habitRowControl
        />
      </View>
    )
  }
  if (!hasChildren) return <View style={styles.structuralColumn} />
  return (
    <Pressable
      onPress={readOnly ? undefined : actions.onToggleExpand}
      disabled={readOnly}
      accessibilityRole="button"
      accessibilityLabel={expanded ? collapseLabel : expandLabel}
      accessibilityState={{ expanded }}
      style={({ pressed }) => [
        styles.structuralColumn,
        pressed && !readOnly
          ? { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] }
          : null,
      ]}
    >
      <View style={{ transform: [{ rotate: expanded ? '0deg' : '-90deg' }] }}>
        <ChevronDown size={20} color={tokens.fg3} strokeWidth={1.8} />
      </View>
    </Pressable>
  )
}

function resolveTitleColor(
  done: boolean,
  child: boolean,
  tokens: ReturnType<typeof createTokensV2>,
): string {
  if (done) return tokens.fg3
  return child ? tokens.fg2 : tokens.fg1
}

function resolveBodyPressAction(
  readOnly: boolean,
  selectMode: boolean,
  actions: HabitRowActions,
): (() => void) | undefined {
  if (readOnly) return undefined
  return selectMode ? actions.onToggleSelection : actions.onDetail
}

function useBodyPressFeedback(
  readOnly: boolean,
  tokens: ReturnType<typeof createTokensV2>,
) {
  const [pressed, setPressed] = useState(false)
  return {
    feedbackStyle:
      pressed && !readOnly
        ? { backgroundColor: tokens.bgHover, borderColor: tokens.hairlineStrong }
        : null,
    onPressIn: readOnly ? undefined : () => setPressed(true),
    onPressOut: readOnly ? undefined : () => setPressed(false),
  }
}

function buildRowStyle({
  child,
  selected,
  panelStart,
  panelEnd,
  tokens,
}: Readonly<{
  child: boolean
  selected: boolean
  panelStart: boolean
  panelEnd: boolean
  tokens: ReturnType<typeof createTokensV2>
}>): ViewStyle {
  return {
    minHeight: child ? 52 : 68,
    marginBottom: panelEnd ? 12 : 0,
    paddingLeft: child ? 24 : 0,
    backgroundColor: selected ? tokens.selectionBg : tokens.bgCard,
    borderColor: tokens.hairline,
    borderTopWidth: panelStart ? StyleSheet.hairlineWidth : 0,
    borderBottomWidth: panelEnd ? StyleSheet.hairlineWidth : 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: panelStart ? 20 : 0,
    borderTopRightRadius: panelStart ? 20 : 0,
    borderBottomLeftRadius: panelEnd ? 20 : 0,
    borderBottomRightRadius: panelEnd ? 20 : 0,
  }
}

/**
 * Habit row: structural column · emoji well · title/meta · trailing status.
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
  readOnly: readOnlyOverride,
  childrenDone = 0,
  childrenTotal = 0,
  actions = EMPTY_HABIT_ROW_ACTIONS,
  style,
  panelStart = true,
  panelEnd = true,
  hasProAccess = true,
}: Readonly<HabitRowProps>) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { displayTime } = useTimeFormat()

  const isChild = depth === 1
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
  const boundary = getTodayBoundary(selectedDateStr, todayStr)
  const readOnly = readOnlyOverride ?? boundary === 'read-only'
  const completionReadOnly = readOnly || (boundary === 'future' && !canLog)

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

  const dotState = resolveHabitRowDotState(isDoneForRange, habit.isBadHabit, isOverdue)

  const emoji = habit.emoji

  const {
    anchorRef: menuButtonRef,
    visible: menuVisible,
    open: openAnchoredMenu,
    close: closeAnchoredMenu,
  } = useAnchoredMenu()
  const hasMenuActions = hasHabitRowMenuActions(actions, isSelectMode)
  const menuItems = useMemo(
    () => buildMenuItems(actions, isSelectMode, completionReadOnly, hasProAccess, t),
    [actions, completionReadOnly, hasProAccess, isSelectMode, t],
  )

  const openMenu = useCallback(() => {
    if (readOnly) return
    openAnchoredMenu()
  }, [openAnchoredMenu, readOnly])

  const closeMenu = useCallback(() => {
    closeAnchoredMenu()
  }, [closeAnchoredMenu])

  const handlePress = resolveBodyPressAction(readOnly, isSelectMode, actions)
  const bodyPressFeedback = useBodyPressFeedback(readOnly, tokens)
  const toggleStatusAction = isDoneForRange ? actions.onUnlog : actions.onLog
  const handleToggleStatus = () => {
    if (!completionReadOnly) toggleStatusAction?.()
  }

  const titleSize = isChild ? 14 : 16
  const emojiSize = isChild ? 16 : 22
  const wellSize = isChild ? 32 : 46
  const wellRadius = 12

  const titleColor = resolveTitleColor(isDoneForRange, isChild, tokens)
  const rowStyle = buildRowStyle({
    child: isChild,
    selected: isSelected,
    panelStart,
    panelEnd,
    tokens,
  })

  const rowAccessibilityLabel = useMemo(
    () =>
      buildHabitRowAccessibilityLabel({
        title: habit.title,
        dotState,
        linkedGoal: false,
        showStreak: false,
        streak: 0,
        t,
      }),
    // react-doctor-disable-next-line exhaustive-deps -- streak is the extracted habit.currentStreak and already listed; the analyzer wants the qualified member path but the alias tracks it https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    [habit.title, dotState, t],
  )

  return (
    <View>
      <View
        testID="habit-row"
        accessibilityState={{ disabled: readOnly }}
        style={[
          styles.row,
          rowStyle,
          bodyPressFeedback.feedbackStyle,
          style,
          readOnly ? styles.readOnly : null,
        ]}
      >
        <HabitRowStructuralColumn
          selectMode={isSelectMode}
          selected={isSelected}
          title={habit.title}
          hasChildren={hasChildren}
          expanded={isExpanded}
          actions={actions}
          tokens={tokens}
          collapseLabel={t('common.collapse')}
          expandLabel={t('common.expand')}
          readOnly={readOnly}
        />

        <Pressable
          onPress={handlePress}
          onPressIn={bodyPressFeedback.onPressIn}
          onPressOut={bodyPressFeedback.onPressOut}
          onLongPress={readOnly || isSelectMode ? undefined : actions.onLongPressCard}
          disabled={readOnly}
          delayLongPress={500}
          accessibilityRole="button"
          accessibilityLabel={rowAccessibilityLabel}
          style={({ pressed }) => [
            styles.bodyButton,
            { paddingVertical: isChild ? 4 : 8 },
            pressed ? styles.bodyButtonPressed : null,
          ]}
        >
          <HabitRowLeading
            habitTitle={habit.title}
            emoji={emoji}
            emojiSize={emojiSize}
            wellSize={wellSize}
            wellRadius={wellRadius}
            tokens={tokens}
          />

          <HabitRowContent
            habit={habit}
            titleSize={titleSize}
            titleColor={titleColor}
            isDoneForRange={isDoneForRange}
            metaParts={metaParts}
            tokens={tokens}
          />
        </Pressable>

        <HabitRowTrailing
          habit={habit}
          depth={depth}
          isSelectMode={isSelectMode}
          hasChildren={hasChildren}
          childrenDone={childrenDone}
          childrenTotal={childrenTotal}
          isDoneForRange={isDoneForRange}
          canLog={canLog}
          dotState={dotState}
          hasMenuActions={hasMenuActions}
          menuButtonRef={menuButtonRef}
          actions={actions}
          tokens={tokens}
          onToggleStatus={handleToggleStatus}
          onOpenMenu={openMenu}
          readOnly={readOnly}
          completionReadOnly={completionReadOnly}
        />
      </View>

      {hasMenuActions ? (
        <Menu
          open={menuVisible}
          anchorRef={menuButtonRef}
          onClose={closeMenu}
          title={t('habits.actions.more')}
          items={menuItems}
          onSelect={(id) => {
            if (!readOnly) runMenuAction(actions, id)
          }}
        />
      ) : null}
    </View>
  )
}
