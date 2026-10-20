import { SPACING } from '@orbit/shared/theme'
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
  resolveHabitAccessibleStatus,
  getHabitRowTypeLabelKey,
  stripInlineMarkdown,
  type TodayBoundary,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { MenuItem } from '@orbit/shared/contracts/overlay'
import { useTimeFormat } from '@/hooks/use-time-format'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { Menu, useAnchoredMenu } from '@/components/ui/menu'
import { ChevronDown } from '@/components/ui/icons'
import { Checkbox } from '@/components/ui/checkbox'
import { HabitRowContent, HabitRowMetaStrip, HabitRowTypeLabel } from './habit-row-content'
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
  const [hovered, setHovered] = useState(false)
  if (!hasChildren) return null
  return (
    <Pressable
      onPress={actions.onToggleExpand}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={expanded ? collapseLabel : expandLabel}
      accessibilityState={{ expanded }}
      style={({ pressed }) => [
        styles.structuralColumn,
        hovered ? { backgroundColor: tokens.bgHover } : null,
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

function HabitRowSelection({ title, selected, onToggleSelection, tokens }: Readonly<{
  title: string
  selected: boolean
  onToggleSelection?: () => void
  tokens: ReturnType<typeof createTokensV2>
}>) {
  const [hovered, setHovered] = useState(false)
  return (
    <Pressable onPress={onToggleSelection}
      onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)}
      accessibilityRole="checkbox" accessibilityLabel={title} accessibilityState={{ checked: selected }}
      style={({ pressed }) => [styles.structuralColumn,
        hovered || pressed ? { backgroundColor: tokens.bgHover } : null,
        pressed ? { transform: [{ scale: 0.96 }] } : null]}>
      <Checkbox checked={selected} onChange={() => onToggleSelection?.()} as="span" />
    </Pressable>
  )
}

function renderHabitRowPrimaryButton({ supportingMeta, bodyLayout, children, ...props }: Readonly<InsetFocusPressableProps & {
  supportingMeta: boolean
  bodyLayout: ViewStyle
}>) {
  return (
    <Pressable {...props} style={() => [
      styles.bodyButton,
      bodyLayout,
      supportingMeta ? StyleSheet.absoluteFill : null,
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

function resolveBoundaryCompletionReason(
  boundary: TodayBoundary,
  t: (key: string) => string,
): string | undefined {
  if (boundary === 'read-only') return t('habits.todayBoundary.readOnly')
  if (boundary === 'future') return t('habits.todayBoundary.future')
  return undefined
}

function useBodyPressFeedback(
  tokens: ReturnType<typeof createTokensV2>,
) {
  const [pressed, setPressed] = useState(false)
  const [hovered, setHovered] = useState(false)
  const active = pressed || hovered
  return {
    active,
    metaColor: active ? tokens.fg2 : tokens.fg3,
    outlineColor: active ? tokens.hairlineStrong : tokens.hairline,
    onPressIn: () => setPressed(true),
    onPressOut: () => setPressed(false),
    onHoverIn: () => setHovered(true),
    onHoverOut: () => setHovered(false),
  }
}

function buildRowStyle({
  child,
  selected,
  active,
  tokens,
}: Readonly<{
  child: boolean
  selected: boolean
  active: boolean
  tokens: ReturnType<typeof createTokensV2>
}>): ViewStyle {
  let backgroundColor = tokens.bgCard
  if (active) backgroundColor = tokens.bgHover
  else if (selected) backgroundColor = tokens.selectionBg
  return {
    minHeight: child ? 52 : 68,
    backgroundColor,
    borderRadius: 20,
  }
}

function habitRowSpacing(panelEnd: boolean): ViewStyle {
  return { paddingBottom: panelEnd ? SPACING.s12 : SPACING.s4 }
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
  panelEnd = true,
  hasProAccess = true,
}: Readonly<HabitRowProps>) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const { fontScale } = useWindowDimensions()
  const largeText = fontScale > 1.3
  const supportingMeta = largeText
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
  const completionReason = completionReasonOverride ?? resolveBoundaryCompletionReason(boundary, t)

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

  const description = stripInlineMarkdown(habit.description ?? '')
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
    active: bodyPressFeedback.active,
    tokens,
  })

  const knownRowAccessibilityLabel = buildHabitRowAccessibilityLabel({
    title: `${habit.title}, ${t(getHabitRowTypeLabelKey(habit))}`,
    dotState: resolveHabitAccessibleStatus(dotState, isDoneForRange),
    metaParts,
    linkedGoal: false,
    showStreak: false,
    streak: 0,
    t,
  })
  const rowAccessibilityLabel = completionStatusUnavailable ? `${habit.title}, ${t(getHabitRowTypeLabelKey(habit))}` : knownRowAccessibilityLabel

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

      <HabitRowContent expanded={isSelectMode && isSelected}
        largeText={largeText}
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
    onHoverIn: bodyPressFeedback.onHoverIn,
    onHoverOut: bodyPressFeedback.onHoverOut,
    onLongPress: isSelectMode ? undefined : actions.onLongPressCard,
    delayLongPress: 500,
    accessibilityRole: 'button',
    accessibilityLabel: rowAccessibilityLabel,
    accessibilityHint: [description, futureHint?.label].filter(Boolean).join(' ') || undefined,
    supportingMeta,
    bodyLayout,
    children: primaryContent,
  })
  const rowContents = (
    <>
        {structuralColumn && isSelectMode ? (
          <HabitRowSelection title={`${habit.title}, ${t(getHabitRowTypeLabelKey(habit))}`} selected={isSelected}
            onToggleSelection={actions.onToggleSelection} tokens={tokens} />
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
    <View style={habitRowSpacing(panelEnd)}>
      <HabitRowLayout descriptionPresent={Boolean(description)} isChild={isChild} supportingMeta={supportingMeta}
        rowStyle={[rowStyle, style]} outlineColor={bodyPressFeedback.outlineColor} primaryButton={primaryButton} primaryContent={primaryContent} metaParts={metaParts}
        metaColor={bodyPressFeedback.metaColor} typeLabel={t(getHabitRowTypeLabelKey(habit))} tokens={tokens}>
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

function HabitRowLayout({ descriptionPresent, isChild, supportingMeta, rowStyle, outlineColor, primaryButton, primaryContent, metaParts, metaColor, typeLabel, tokens, children }: Readonly<{
  descriptionPresent: boolean
  isChild: boolean
  supportingMeta: boolean
  rowStyle: StyleProp<ViewStyle>
  outlineColor: string
  primaryButton: ReactNode
  primaryContent: ReactNode
  metaParts: Parameters<typeof HabitRowContent>[0]['metaParts']
  metaColor: string
  typeLabel: string
  tokens: ReturnType<typeof createTokensV2>
  children: ReactNode
}>) {
  return (
    <View testID="habit-row" style={[supportingMeta ? null : styles.row, rowStyle]}>
      {supportingMeta ? primaryButton : null}
      {supportingMeta ? (
        <View pointerEvents="box-none" style={[styles.row, { minHeight: isChild ? 52 : 68, alignItems: 'flex-start', paddingTop: isChild ? SPACING.s4 : SPACING.s8, paddingBottom: descriptionPresent ? SPACING.s4 : undefined }]}>
          <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
            style={[styles.bodyButton, habitRowBodyLayout(isChild, supportingMeta)]}>
            {primaryContent}
          </View>
          {children}
        </View>
      ) : <>{primaryButton}{children}</>}
      {supportingMeta ? (
        <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
          style={{ flexDirection: 'row', gap: 12, paddingLeft: isChild ? SPACING.s24 : SPACING.s8, paddingRight: SPACING.s8, paddingTop: descriptionPresent ? SPACING.s0 : SPACING.s4, paddingBottom: SPACING.s8 }}>
          <View style={{ width: 48, flexShrink: 0 }} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <HabitRowTypeLabel label={typeLabel} color={metaColor} />
            <HabitRowMetaStrip metaParts={metaParts} metaColor={metaColor} tokens={tokens} expanded />
          </View>
        </View>
      ) : null}
      <View testID="habit-row-outline" pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderWidth: 1, borderRadius: 20, borderColor: outlineColor }} />
    </View>
  )
}

function habitRowBodyLayout(isChild: boolean, largeText: boolean): ViewStyle {
  const defaultPaddingVertical = isChild ? SPACING.s4 : SPACING.s8
  return {
    paddingVertical: largeText ? SPACING.s0 : defaultPaddingVertical,
    paddingLeft: isChild ? SPACING.s24 : SPACING.s8,
    alignItems: largeText ? 'flex-start' : 'center',
  }
}
