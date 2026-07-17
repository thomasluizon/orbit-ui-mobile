'use client'

import { type MouseEvent } from 'react'
import { useTranslations } from 'next-intl'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { useContextMenu } from '@/components/ui/context-menu'
import type { StatusDotState } from '@/components/ui/status-dot'
import { HabitRowContent, type HabitRowMetaToken } from './habit-row-content'
import { HabitRowLeading } from './habit-row-leading'
import { HabitRowTrailing } from './habit-row-trailing'
import { buildHabitRowContextMenuItems } from './habit-row-context-menu-items'
import { MAX_INLINE_DEPTH } from './habit-list/tree-helpers'

export type { HabitRowMetaToken }

const EMPTY_META: HabitRowMetaToken[] = []
const EMPTY_ACTIONS: HabitRowActions = {}

const ROW_BASE_CLASS =
  'relative flex items-center cursor-pointer transition-[background-color,transform,box-shadow] duration-[160ms] ease-[var(--ease-standard)] active:scale-[0.99]'

/** Surface classes for a row. In a panel the row is transparent (the panel owns
 *  the fill and ring); standalone it carries its own card fill and inset ring. */
function rowSurfaceClassName(inPanel: boolean, selected: boolean): string {
  if (inPanel) {
    return `${ROW_BASE_CLASS} ${
      selected ? 'bg-[var(--bg-sunk)]' : 'hover:bg-[var(--bg-elev-pressed)]'
    }`
  }
  return `${ROW_BASE_CLASS} shadow-[inset_0_0_0_1px_var(--hairline)] ${
    selected
      ? 'bg-[var(--bg-sunk)]'
      : 'bg-[var(--bg-card)] hover:bg-[var(--bg-elev-pressed)] hover:shadow-[inset_0_0_0_1px_var(--hairline-strong)]'
  }`
}

/** Geometry for a row: in a panel it rounds only its outer panel corners and
 *  indents interiorly; standalone it keeps its own radius and sibling margins. */
function rowSurfaceStyle(
  inPanel: boolean,
  firstInPanel: boolean,
  lastInPanel: boolean,
  indentPx: number,
): React.CSSProperties {
  if (inPanel) {
    return {
      gap: 14,
      padding: `14px 16px 14px ${16 + indentPx}px`,
      borderTopLeftRadius: firstInPanel ? 18 : 0,
      borderTopRightRadius: firstInPanel ? 18 : 0,
      borderBottomLeftRadius: lastInPanel ? 18 : 0,
      borderBottomRightRadius: lastInPanel ? 18 : 0,
    }
  }
  return {
    gap: 14,
    padding: '14px 16px',
    borderRadius: 18,
    marginLeft: 20 + indentPx,
    marginRight: 20,
    marginBottom: 10,
  }
}

/** Action callbacks consumed by HabitRow. Mirrors the mobile shape so that
 *  cross-platform call sites can pass the same handler bag. */
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
}

/** Linear-tight habit row: emoji / chevron / title (wraps to two lines) / inline meta / status dot / streak.
 *  Sub-habit rows ("child") show depth by indent, a smaller well, and dimmer text; there are no connector lines. */
interface HabitRowProps {
  habit: NormalizedHabit
  /** Derived display state (computed by caller from instances/logs). */
  state?: StatusDotState
  /** Inline tokens between title and trailing dot (frequency, time, X/Y checklist, overdue, bad). */
  meta?: HabitRowMetaToken[]
  /** Whether the status dot may be tapped to log for the selected date. When false and not done,
   *  the dot renders disabled/read-only (mirrors the backend log rule). Defaults to true. */
  canLog?: boolean
  /** Streak number from `habit.currentStreak` — only rendered when >= 2 and not child. */
  streak?: number
  /** True when this row is rendered under a parent. Renders with smaller text. */
  child?: boolean
  /** Nesting depth (0 = top-level). Drives the left indent so hierarchy is visible. */
  depth?: number
  selectMode?: boolean
  selected?: boolean
  /** Parent expand/collapse. Caller is responsible for managing expanded state. */
  hasChildren?: boolean
  expanded?: boolean
  /** When the row is a parent, displays a ParentRing instead of StatusDot. */
  childProgress?: { done: number; total: number }
  /** Whether to render the small linked-goal indicator (5px primary dot before the status). */
  showLinkedGoalDot?: boolean
  /** Optional data attribute (`data-tour`) used by the feature tour. */
  tourTargetId?: string
  /** True when the row sits inside a grouped tonal panel: the row drops its own
   *  card fill, ring, and margins and rounds only its outer panel corners. */
  inPanel?: boolean
  /** First row of its panel (rounds the top corners). */
  firstInPanel?: boolean
  /** Last row of its panel (rounds the bottom corners). */
  lastInPanel?: boolean
  /** Force the accent drill-in chevron regardless of depth. Set for the drilled
   *  node's own children, which are the root of a focused sub-list. */
  forceDrillChevron?: boolean
  /** When false, a deeper family always uses the grey expand chevron and never
   *  the drill chevron. Set on the all view, which renders the full tree inline. */
  enableDrillChevron?: boolean
  actions?: HabitRowActions
}

export function HabitRow({
  habit,
  state = 'empty',
  meta = EMPTY_META,
  canLog = true,
  streak,
  child = false,
  depth = 0,
  selectMode = false,
  selected = false,
  hasChildren = false,
  expanded = false,
  childProgress,
  showLinkedGoalDot = false,
  tourTargetId,
  inPanel = false,
  firstInPanel = false,
  lastInPanel = false,
  forceDrillChevron = false,
  enableDrillChevron = true,
  actions = EMPTY_ACTIONS,
}: Readonly<HabitRowProps>) {
  const t = useTranslations()
  const {
    onDetail,
    onToggleSelection,
    onLog,
    onUnlog,
    onToggleExpand,
    onEdit,
    onDuplicate,
    onSkip,
    onDelete,
    onAddSubHabit,
    onEnterSelectMode,
    onDrillInto,
  } = actions
  const canSelect = !selectMode && !!onEnterSelectMode
  const canDrillInto = hasChildren && !!onDrillInto
  const drillMode =
    canDrillInto && enableDrillChevron && (depth >= MAX_INLINE_DEPTH || forceDrillChevron)
  const hasMenuActions = !!(
    onEdit ||
    onDuplicate ||
    actions.onMoveParent ||
    onAddSubHabit ||
    onSkip ||
    actions.onReschedule ||
    onDelete ||
    canSelect ||
    canDrillInto
  )

  const isDone = state === 'done'
  const isSkip = state === 'skip'
  const titleSize = child ? 14 : 16
  const emojiSize = child ? 16 : 22
  const wellSize = child ? 36 : 46
  const wellRadius = child ? 12 : 14
  const showStreak = !child && !selectMode && streak != null && streak >= 2

  const indentPx = depth * 16

  const contextMenuItems = buildHabitRowContextMenuItems({
    selectMode,
    isDone,
    canLog,
    onLog,
    onSkip,
    onDetail,
    onEdit,
    onDuplicate,
    onAddSubHabit,
    onDelete,
    t,
  })

  const { onContextMenu, contextMenu } = useContextMenu(contextMenuItems)

  const rowPrimaryAction = selectMode ? onToggleSelection : onDetail

  function handleRowClick() {
    rowPrimaryAction?.()
  }

  function handleToggleStatus() {
    if (isDone) onUnlog?.()
    else onLog?.()
  }

  function handleExpand(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    onToggleExpand?.()
  }

  function handleDrill(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    onDrillInto?.()
  }

  function getTitleColor(): string {
    if (isDone) return 'var(--fg-3)'
    if (isSkip) return 'var(--fg-3)'
    return 'var(--fg-1)'
  }

  const row = (
    <div
      onClick={handleRowClick}
      onContextMenu={onContextMenu}
      // react-doctor-disable-next-line prefer-tag-over-role -- the row wraps nested interactive controls (status-dot button, overflow menu) that a native <button> cannot legally contain; div+role=button with full Enter/Space keyboard handling is the accessible pattern here https://github.com/thomasluizon/orbit-ui-mobile/issues/243
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleRowClick()
        }
      }}
      data-tour={tourTargetId}
      data-testid="habit-row"
      data-habit-title={habit.title}
      className={rowSurfaceClassName(inPanel, selected)}
      style={rowSurfaceStyle(inPanel, firstInPanel, lastInPanel, indentPx)}
    >
      <HabitRowLeading
        title={habit.title}
        emoji={habit.emoji}
        emojiSize={emojiSize}
        wellSize={wellSize}
        wellRadius={wellRadius}
        selectMode={selectMode}
        selected={selected}
        hasChildren={hasChildren}
        expanded={expanded}
        drillMode={drillMode}
        onToggleSelection={onToggleSelection}
        onExpand={handleExpand}
        onDrill={handleDrill}
      />

      <HabitRowContent
        habit={habit}
        titleSize={titleSize}
        titleColor={getTitleColor()}
        isDone={isDone}
        meta={meta}
        showStreak={showStreak}
        streak={streak}
      />

      <HabitRowTrailing
        habit={habit}
        selectMode={selectMode}
        hasChildren={hasChildren}
        childProgress={childProgress}
        showLinkedGoalDot={showLinkedGoalDot}
        state={state}
        isDone={isDone}
        canLog={canLog}
        hasMenuActions={hasMenuActions}
        canSelect={canSelect}
        canDrillInto={canDrillInto}
        actions={actions}
        onToggleStatus={handleToggleStatus}
      />
    </div>
  )

  return (
    <>
      {row}
      {contextMenu}
    </>
  )
}
