import { SPACING } from '@orbit/shared/theme'
import { InsetFocusPressable as Pressable, type InsetFocusPressableProps } from '@/components/ui/inset-focus-pressable'
import { memo, useCallback, useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle, type LayoutChangeEvent } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  canLogHabitOnDate,
  computeHabitCardStatus,
  formatAPIDate,
  getTodayBoundary,
  isHabitDoneForRange,
  resolveHabitAccessibleStatus,
  getHabitInlineDepthLimit,
  stripInlineMarkdown,
  type TodayBoundary,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { HabitRowBase } from '@orbit/shared/contracts/lists'
import type { MenuItem } from '@orbit/shared/contracts/overlay'
import { useTimeFormat } from '@/hooks/use-time-format'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { Menu, useAnchoredMenu } from '@/components/ui/menu'
import { ChevronDown } from '@/components/ui/icons'
import { Checkbox } from '@/components/ui/checkbox'
import { habitRowMetaPartKey, HabitRowContent, HabitRowMetaStrip, type HabitRowMetaPart } from './habit-row-content'
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
  isOverdue: boolean,
  hasSubHabits: boolean,
  t: (key: string) => string,
): MenuItem[] {
  const items: MenuItem[] = []
  if (actions.onAddSubHabit) items.push({ id: 'add', label: t('habits.actions.addSubHabit'), icon: 'subtask' })
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
  /** Visible depth relative to the current list context; each ancestor adds one spacing step. */
  depth?: HabitRowBase['depth']
  drillInsteadOfExpand?: boolean
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
}

function HabitRowStructuralColumn({
  hasChildren,
  drillInsteadOfExpand,
  expanded,
  actions,
  tokens,
  collapseLabel,
  expandLabel,
  drillLabel,
}: Readonly<{
  hasChildren: boolean
  drillInsteadOfExpand: boolean
  expanded: boolean
  actions: HabitRowActions
  tokens: ReturnType<typeof createTokensV2>
  collapseLabel: string
  expandLabel: string
  drillLabel: string
}>) {
  const [hovered, setHovered] = useState(false)
  if (!hasChildren) return null
  return (
    <Pressable
      onPress={actions.onToggleExpand}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={drillInsteadOfExpand ? drillLabel : expanded ? collapseLabel : expandLabel}
      accessibilityState={drillInsteadOfExpand ? undefined : { expanded }}
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

function useHabitRowMetadataFit(metaParts: HabitRowMetaPart[]) {
  const [measurements, setMeasurements] = useState<{ contentWidth: number; widths: Record<string, number> }>({ contentWidth: Infinity, widths: {} })
  const keys = metaParts.filter((part) => typeof part === 'string' || part.kind !== 'future').map((part, index) => habitRowMetaPartKey(part, index))
  const onContentWidth = (contentWidth: number) => setMeasurements((previous) => previous.contentWidth === contentWidth ? previous : { ...previous, contentWidth })
  const onTokenWidth = (key: string, width: number) => setMeasurements((previous) => previous.widths[key] === width ? previous : {
    ...previous,
    widths: Object.fromEntries(keys.map((current) => [current, current === key ? width : previous.widths[current] ?? 0])),
  })
  return { onContentWidth, onTokenWidth, narrow: keys.some((key) => (measurements.widths[key] ?? 0) > measurements.contentWidth) }
}

// react-doctor-disable-next-line no-many-boolean-props -- private row-internal component; the flags are independent render inputs from the parent list, not a combinatorial public API https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export const HabitRow = memo(function HabitRow({
  habit,
  selectedDate,
  today,
  depth = 0,
  drillInsteadOfExpand = false,
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
}: Readonly<HabitRowProps>) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const { width, fontScale } = useWindowDimensions()
  const largeText = fontScale > 1.3
  const [contentWidth, setContentWidth] = useState<number>()
  const measureRow = useCallback((event: LayoutChangeEvent) => setContentWidth(event.nativeEvent.layout.width), [])
  const depthBoundary = depth > 0 && depth >= getHabitInlineDepthLimit(width, fontScale, contentWidth)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const { displayTime } = useTimeFormat()

  const isChild = depth > 0
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
  const { onContentWidth, onTokenWidth, narrow } = useHabitRowMetadataFit(metaParts)
  const supportingMeta = largeText || depthBoundary || narrow

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
    () => buildMenuItems(actions, isSelectMode, completionReadOnly, isOverdue, habit.hasSubHabits, t),
    [actions, completionReadOnly, habit.hasSubHabits, isOverdue, isSelectMode, t],
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

  const bodyLayout = habitRowBodyLayout(depth, supportingMeta)
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
    title: habit.title,
    dotState: completionStatusUnavailable ? undefined : resolveHabitAccessibleStatus(dotState, isDoneForRange),
    metaParts,
    linkedGoal: false,
    showStreak: false,
    streak: 0,
    t,
  })
  const selectionLabel = [habit.title, ...metaParts.flatMap((part) => typeof part !== 'string' && (part.kind === 'type' || part.kind === 'checklist') ? [part.label] : [])].join(', ')

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
        onContentWidth={onContentWidth} onTokenWidth={onTokenWidth}
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
    accessibilityLabel: knownRowAccessibilityLabel,
    accessibilityHint: [description, futureHint?.label].filter(Boolean).join(' ') || undefined,
    supportingMeta,
    bodyLayout,
    children: primaryContent,
  })
  const rowContents = (
    <>
        {structuralColumn && isSelectMode ? (
          <HabitRowSelection title={selectionLabel} selected={isSelected}
            onToggleSelection={actions.onToggleSelection} tokens={tokens} />
        ) : null}
        {structuralColumn ? (
          <HabitRowStructuralColumn
            hasChildren={hasChildren}
            drillInsteadOfExpand={drillInsteadOfExpand}
            drillLabel={t('habits.actions.openSubHabits')}
            expanded={isExpanded}
            actions={actions}
            tokens={tokens}
            collapseLabel={t('common.collapse')}
            expandLabel={t('common.expand')}
          />
        ) : null}

        <HabitRowTrailing
            habit={habit}
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
      <HabitRowLayout onLayout={measureRow} depth={depth} descriptionPresent={Boolean(description)} isChild={isChild} supportingMeta={supportingMeta}
        rowStyle={[rowStyle, style]} outlineColor={bodyPressFeedback.outlineColor} primaryButton={primaryButton} primaryContent={primaryContent} metaParts={metaParts}
        metaColor={bodyPressFeedback.metaColor} largeText={largeText} onTokenWidth={onTokenWidth} tokens={tokens}>
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

function HabitRowLayout({ onLayout, depth, descriptionPresent, isChild, supportingMeta, rowStyle, outlineColor, primaryButton, primaryContent, metaParts, metaColor, largeText, onTokenWidth, tokens, children }: Readonly<{
  onLayout: (event: LayoutChangeEvent) => void
  depth: number
  descriptionPresent: boolean
  isChild: boolean
  supportingMeta: boolean
  rowStyle: StyleProp<ViewStyle>
  outlineColor: string
  primaryButton: ReactNode
  primaryContent: ReactNode
  metaParts: Parameters<typeof HabitRowContent>[0]['metaParts']
  metaColor: string
  largeText: boolean
  onTokenWidth: (key: string, width: number) => void
  tokens: ReturnType<typeof createTokensV2>
  children: ReactNode
}>) {
  return (
    <View testID="habit-row" onLayout={onLayout} style={[supportingMeta ? null : [styles.row, { gap: SPACING.s0 }], rowStyle]}>
      {supportingMeta ? primaryButton : null}
      {supportingMeta ? (
        <View pointerEvents="box-none" style={[styles.row, { minHeight: isChild ? 52 : 68, alignItems: 'flex-start', paddingTop: isChild ? SPACING.s4 : SPACING.s8, paddingBottom: descriptionPresent ? SPACING.s4 : undefined }]}>
          <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
            style={[styles.bodyButton, habitRowBodyLayout(depth, supportingMeta)]}>
            {primaryContent}
          </View>
          {children}
        </View>
      ) : <>{primaryButton}<View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: SPACING.s4 }}>{children}</View></>}
      {supportingMeta ? (
        <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
          style={{ flexDirection: 'row', gap: 12, paddingLeft: SPACING.s8 + depth * SPACING.s16, paddingRight: SPACING.s8, paddingTop: descriptionPresent ? SPACING.s0 : SPACING.s4, paddingBottom: SPACING.s8 }}>
          <View style={{ width: 48, flexShrink: 0 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <HabitRowMetaStrip metaParts={metaParts} metaColor={metaColor} tokens={tokens} largeText={largeText} onTokenWidth={onTokenWidth} />
          </View>
        </View>
      ) : null}
      <View testID="habit-row-outline" pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderWidth: 1, borderRadius: 20, borderColor: outlineColor }} />
    </View>
  )
}

function habitRowBodyLayout(depth: number, supportingMeta: boolean): ViewStyle {
  const defaultPaddingVertical = depth > 0 ? SPACING.s4 : SPACING.s8
  return {
    paddingVertical: supportingMeta ? SPACING.s0 : defaultPaddingVertical,
    paddingLeft: SPACING.s8 + depth * SPACING.s16,
    paddingRight: supportingMeta ? SPACING.s0 : SPACING.s4,
    alignItems: supportingMeta ? 'flex-start' : 'center',
  }
}
