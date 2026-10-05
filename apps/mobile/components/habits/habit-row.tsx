import { InsetFocusPressable as Pressable, type InsetFocusPressableProps } from '@/components/ui/inset-focus-pressable'
import { memo, useCallback, useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  canLogHabitOnDate,
  computeHabitCardStatus,
  formatAPIDate,
  getTodayBoundary,
  isHabitDoneForRange,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { MenuItem } from '@orbit/shared/contracts/overlay'
import { useTimeFormat } from '@/hooks/use-time-format'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { Menu, useAnchoredMenu } from '@/components/ui/menu'
import { ChevronDown } from '@/components/ui/icons'
import { Checkbox } from '@/components/ui/checkbox'
import { HabitRowContent, HabitRowMetaStrip } from './habit-row-content'
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
  isOverdue: boolean,
  hasSubHabits: boolean,
  t: (key: string) => string,
): MenuItem[] {
  const items: MenuItem[] = []
  if (actions.onAddSubHabit) items.push({ id: 'add', label: t('habits.actions.addSubHabit'), icon: 'subtask', badge: hasProAccess ? undefined : 'Pro' })
  if (actions.onMoveParent) items.push({ id: 'move', label: t('habits.actions.moveUnder'), icon: 'arrows-move' })
  if (actions.onSkip && !completionReadOnly) items.push({ id: 'skip', label: t('habits.actions.skip'), icon: 'player-skip-forward' })
  if (actions.onReschedule && isOverdue && !completionReadOnly) items.push({ id: 'reschedule', label: t('habits.actions.reschedule'), icon: 'calendar-time' })
  if (actions.onEdit) items.push({ id: 'edit', label: t('common.edit'), icon: 'pencil' })
  if (actions.onDuplicate) items.push({ id: 'duplicate', label: t('habits.actions.duplicate'), icon: 'copy' })
  if (actions.onEnterSelectMode && !isSelectMode) {
    items.push({ id: 'select', label: t('common.select'), icon: 'checkbox' })
  }
  if (actions.onDrillInto && hasSubHabits) items.push({ id: 'drill', label: t('habits.actions.openSubHabits'), icon: 'list-tree' })
  if (actions.onDelete) {
    items.push({ id: 'delete', label: t('habits.actions.delete'), icon: 'trash', destructive: true })
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

export interface HabitRowProps {
  habit: NormalizedHabit
  selectedDate?: Date
  today?: string
  /** Two inline display levels. Deeper data descendants are clamped to level 1 by the list. */
  depth?: 0 | 1
  structuralColumn?: boolean
  isSelectMode?: boolean
  isSelected?: boolean
  hasChildren?: boolean
  isExpanded?: boolean
  completionReadOnly?: boolean
  completionReason?: string
  completionStatusUnavailable?: boolean
  childrenDone?: number
  childrenTotal?: number
  actions?: HabitRowActions
  style?: StyleProp<ViewStyle>
  panelStart?: boolean
  panelEnd?: boolean
  hasProAccess?: boolean
}

function HabitRowStructuralColumn({
  hasChildren,
  expanded,
  actions,
  tokens,
  collapseLabel,
  expandLabel,
}: Readonly<{
  hasChildren: boolean
  expanded: boolean
  actions: HabitRowActions
  tokens: ReturnType<typeof createTokensV2>
  collapseLabel: string
  expandLabel: string
}>) {
  if (!hasChildren) return null
  return (
    <Pressable
      onPress={actions.onToggleExpand}
      accessibilityRole="button"
      accessibilityLabel={expanded ? collapseLabel : expandLabel}
      accessibilityState={{ expanded }}
      style={({ pressed }) => [
        styles.structuralColumn,
        pressed
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

function renderHabitRowPrimaryButton({ supportingMeta, bodyLayout, bgHover, children, ...props }: Readonly<InsetFocusPressableProps & {
  supportingMeta: boolean
  bodyLayout: ViewStyle
  bgHover: string
}>) {
  return (
    <Pressable {...props} style={({ pressed }) => [
      styles.bodyButton,
      bodyLayout,
      supportingMeta ? StyleSheet.absoluteFill : null,
      pressed ? [styles.bodyButtonPressed, { backgroundColor: bgHover }] : null,
    ]}>
      {supportingMeta ? null : children}
    </Pressable>
  )
}

function resolveTitleColor(
  child: boolean,
  tokens: ReturnType<typeof createTokensV2>,
): string {
  return child ? tokens.fg2 : tokens.fg1
}

function resolveBodyPressAction(
  selectMode: boolean,
  actions: HabitRowActions,
): (() => void) | undefined {
  return selectMode ? actions.onToggleSelection : actions.onDetail
}

function useBodyPressFeedback(
  tokens: ReturnType<typeof createTokensV2>,
) {
  const [pressed, setPressed] = useState(false)
  return {
    metaColor: pressed ? tokens.fg2 : tokens.fg3,
    feedbackStyle:
      pressed
        ? { borderColor: tokens.hairlineStrong }
        : null,
    onPressIn: () => setPressed(true),
    onPressOut: () => setPressed(false),
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

// react-doctor-disable-next-line no-many-boolean-props -- private row-internal component; the flags are independent render inputs from the parent list, not a combinatorial public API https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export const HabitRow = memo(function HabitRow({
  habit,
  selectedDate,
  today,
  depth = 0,
  structuralColumn = false,
  isSelectMode = false,
  isSelected = false,
  hasChildren = false,
  isExpanded = false,
  completionReadOnly: completionReadOnlyOverride,
  completionReason: completionReasonOverride,
  completionStatusUnavailable = false,
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
  const { fontScale } = useWindowDimensions()
  const largeText = fontScale > 1.3
  const supportingMeta = showSupportingMeta(largeText, childrenTotal)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const { displayTime } = useTimeFormat()

  const isChild = depth === 1
  const todayStr = today ?? formatAPIDate(new Date())
  const selectedDateStr = selectedDate ? formatAPIDate(selectedDate) : todayStr

  const isDoneForRange = isHabitDoneForRange(habit)
  const status = useMemo(
    () => computeHabitCardStatus(habit, selectedDate),
    [habit, selectedDate],
  )

  const isOverdue = status === 'overdue'
  const canLog = canLogHabitOnDate(habit, selectedDateStr, todayStr)
  const boundary = getTodayBoundary(selectedDateStr, todayStr)
  const completionReadOnly = completionReadOnlyOverride ?? (boundary === 'read-only' || (boundary === 'future' && !canLog))
  const completionReason = completionReasonOverride ?? (boundary === 'read-only'
    ? t('habits.todayBoundary.readOnly')
    : boundary === 'future' ? t('habits.todayBoundary.future') : undefined)

  const metaParts = buildHabitRowMetaParts({
    habit,
    childProgress: { done: childrenDone, total: childrenTotal },
    isOverdue: habit.isOverdue,
    selectedDateStr,
    todayStr,
    displayTime,
    t,
    locale,
  })

  const futureHint = metaParts.find((part): part is { kind: 'future'; label: string } => typeof part !== 'string' && part.kind === 'future')

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
    () => buildMenuItems(actions, isSelectMode, completionReadOnly, hasProAccess, isOverdue, habit.hasSubHabits, t),
    [actions, completionReadOnly, habit.hasSubHabits, hasProAccess, isOverdue, isSelectMode, t],
  )

  const openMenu = useCallback(() => {
    openAnchoredMenu()
  }, [openAnchoredMenu])

  const closeMenu = useCallback(() => {
    closeAnchoredMenu()
  }, [closeAnchoredMenu])

  const handlePress = resolveBodyPressAction(isSelectMode, actions)
  const bodyPressFeedback = useBodyPressFeedback(tokens)
  const toggleStatusAction = isDoneForRange ? actions.onUnlog : actions.onLog
  const handleToggleStatus = () => {
    if (!completionReadOnly) toggleStatusAction?.()
  }

  const bodyLayout = habitRowBodyLayout(isChild, largeText)
  const titleSize = isChild ? 14 : 17
  const emojiSize = isChild ? 16 : 22
  const wellSize = isChild ? 32 : 46
  const wellRadius = 12

  const titleColor = resolveTitleColor(isChild, tokens)
  const rowStyle = buildRowStyle({
    child: isChild,
    selected: isSelected,
    panelStart,
    panelEnd,
    tokens,
  })

  const knownRowAccessibilityLabel = buildHabitRowAccessibilityLabel({
    title: habit.title,
    dotState,
    metaParts,
    linkedGoal: false,
    showStreak: false,
    streak: 0,
    t,
  })
  const rowAccessibilityLabel = completionStatusUnavailable ? habit.title : knownRowAccessibilityLabel

  const primaryContent = (
    <>
      <HabitRowLeading
        habitTitle={habit.title}
        emoji={emoji}
        emojiSize={emojiSize}
        wellSize={wellSize}
        wellRadius={wellRadius}
        monogramColor={bodyPressFeedback.metaColor}
        tokens={tokens}
      />

      <HabitRowContent
        habit={habit}
        titleSize={titleSize}
        titleColor={titleColor}
        metaColor={bodyPressFeedback.metaColor}
        metaParts={metaParts}
        metaOnSupportingLine={supportingMeta}
        tokens={tokens}
      />
    </>
  )
  const primaryButton = renderHabitRowPrimaryButton({
    onPress: handlePress,
    onPressIn: bodyPressFeedback.onPressIn,
    onPressOut: bodyPressFeedback.onPressOut,
    onLongPress: isSelectMode ? undefined : actions.onLongPressCard,
    delayLongPress: 500,
    accessibilityRole: 'button',
    accessibilityLabel: rowAccessibilityLabel,
    accessibilityHint: futureHint?.label,
    supportingMeta,
    bodyLayout,
    bgHover: tokens.bgHover,
    children: primaryContent,
  })
  const rowContents = (
    <>
        {structuralColumn && isSelectMode ? (
          <Pressable onPress={actions.onToggleSelection} accessibilityRole="checkbox"
            accessibilityLabel={habit.title} accessibilityState={{ checked: isSelected }}
            style={({ pressed }) => [styles.structuralColumn,
              pressed ? { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] } : null]}>
            <Checkbox checked={isSelected} onChange={() => actions.onToggleSelection?.()} as="span" />
          </Pressable>
        ) : null}
        {structuralColumn ? (
          <HabitRowStructuralColumn
            hasChildren={hasChildren}
            expanded={isExpanded}
            actions={actions}
            tokens={tokens}
            collapseLabel={t('common.collapse')}
            expandLabel={t('common.expand')}
          />
        ) : null}

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
          menuVisible={menuVisible}
          completionReadOnly={completionReadOnly}
          completionReason={completionReason}
          completionStatusUnavailable={completionStatusUnavailable}
        />
    </>
  )

  return (
    <View>
      <HabitRowLayout largeText={largeText} isChild={isChild} supportingMeta={supportingMeta}
        rowStyle={[rowStyle, bodyPressFeedback.feedbackStyle, style]} primaryButton={primaryButton} primaryContent={primaryContent} metaParts={metaParts}
        metaColor={bodyPressFeedback.metaColor} tokens={tokens}>
        {rowContents}
      </HabitRowLayout>

      {hasMenuActions ? (
        <Menu
          open={menuVisible}
          anchorRef={menuButtonRef}
          onClose={closeMenu}
          title={habit.title || t('habits.actions.menuTitle')}
          titleMode={rowMenuTitleMode(habit.title)}
          items={menuItems}
          onSelect={(id) => runMenuAction(actions, id)}
        />
      ) : null}
    </View>
  )
})

function rowMenuTitleMode(title: string | null | undefined) {
  return title ? 'typed' : 'label'
}

function HabitRowLayout({ largeText, isChild, supportingMeta, rowStyle, primaryButton, primaryContent, metaParts, metaColor, tokens, children }: Readonly<{
  largeText: boolean
  isChild: boolean
  supportingMeta: boolean
  rowStyle: StyleProp<ViewStyle>
  primaryButton: ReactNode
  primaryContent: ReactNode
  metaParts: Parameters<typeof HabitRowContent>[0]['metaParts']
  metaColor: string
  tokens: ReturnType<typeof createTokensV2>
  children: ReactNode
}>) {
  return (
    <View testID="habit-row" style={[largeText ? null : styles.row, rowStyle]}>
      {supportingMeta ? primaryButton : null}
      {largeText ? (
        <View pointerEvents="box-none" style={[styles.row, { minHeight: isChild ? 52 : 68, alignItems: 'flex-start', paddingTop: isChild ? 4 : 8 }]}>
          {supportingMeta ? (
            <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
              style={[styles.bodyButton, habitRowBodyLayout(isChild, largeText)]}>
              {primaryContent}
            </View>
          ) : primaryButton}
          {children}
        </View>
      ) : <>{primaryButton}{children}</>}
      {supportingMeta ? (
        <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
          style={{ flexDirection: 'row', gap: 12, paddingLeft: 8, paddingBottom: 8 }}>
          <View style={{ width: 48 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <HabitRowMetaStrip metaParts={metaParts} metaColor={metaColor} tokens={tokens} expanded />
          </View>
        </View>
      ) : null}
    </View>
  )
}

function habitRowBodyLayout(isChild: boolean, largeText: boolean): ViewStyle {
  return { paddingVertical: largeText ? 0 : (isChild ? 4 : 8), paddingLeft: 8, alignItems: largeText ? 'flex-start' : 'center' }
}

function showSupportingMeta(largeText: boolean, childrenTotal: number): boolean {
  return largeText && childrenTotal > 0
}
