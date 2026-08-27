'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { HabitStatus } from '@orbit/shared/contracts/lists'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { Menu } from '@/components/ui/menu'
import { ChevronDown } from '@/components/ui/icons'
import { SelectCheck } from '@/components/ui/select-check'
import { HabitRowContent, type HabitRowMetaToken } from './habit-row-content'
import { HabitRowLeading } from './habit-row-leading'
import { HabitRowTrailing } from './habit-row-trailing'
import { buildHabitRowContextMenuItems } from './habit-row-context-menu-items'
import type { MouseEvent as ReactMouseEvent } from 'react'

export type { HabitRowMetaToken }

const EMPTY_META: HabitRowMetaToken[] = []
const EMPTY_ACTIONS: HabitRowActions = {}

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

/** Canonical two-level habit row. List grouping owns its surrounding panel. */
interface HabitRowProps {
  habit: NormalizedHabit
  /** Derived display state (computed by caller from instances/logs). */
  state?: HabitStatus
  /** Inline tokens between title and trailing dot (frequency, time, X/Y checklist, overdue, bad). */
  meta?: HabitRowMetaToken[]
  /** Whether the status dot may be tapped to log for the selected date. When false and not done,
   *  the dot renders disabled/read-only (mirrors the backend log rule). Defaults to true. */
  canLog?: boolean
  /** Streak number from `habit.currentStreak` — only rendered when >= 2 and not child. */
  streak?: number
  /** True when this row is rendered under a parent. Renders with smaller text. */
  child?: boolean
  /** Two inline display levels. Deeper data descendants are clamped to level 1 by the list. */
  depth?: 0 | 1
  selectMode?: boolean
  selected?: boolean
  /** Parent expand/collapse. Caller is responsible for managing expanded state. */
  hasChildren?: boolean
  /** Whether this habit truly has sub-habits (backend-computed, independent of the
   *  current view's visibility filtering). Gates the "go to sub-habits" drill action. */
  hasSubHabits?: boolean
  expanded?: boolean
  /** When the row is a parent, displays a ParentRing instead of StatusDot. */
  childProgress?: { done: number; total: number }
  /** Whether to render the small linked-goal indicator (5px primary dot before the status). */
  showLinkedGoalDot?: boolean
  /** Optional data attribute (`data-tour`) used by the feature tour. */
  tourTargetId?: string
  actions?: HabitRowActions
}

function hasHabitMenuActions(
  actions: HabitRowActions,
  canSelect: boolean,
  canDrillInto: boolean,
): boolean {
  return Boolean(
    actions.onEdit ||
    actions.onDuplicate ||
    actions.onMoveParent ||
    actions.onAddSubHabit ||
    actions.onSkip ||
    actions.onReschedule ||
    actions.onDelete ||
    canSelect ||
    canDrillInto,
  )
}

function HabitRowStructuralColumn({
  selectMode,
  selected,
  title,
  hasChildren,
  expanded,
  onToggleSelection,
  onToggleExpand,
  collapseLabel,
  expandLabel,
}: Readonly<{
  selectMode: boolean
  selected: boolean
  title: string
  hasChildren: boolean
  expanded: boolean
  onToggleSelection?: () => void
  onToggleExpand?: () => void
  collapseLabel: string
  expandLabel: string
}>) {
  if (selectMode) {
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center">
        <SelectCheck selected={selected} onClick={onToggleSelection} ariaLabel={title} />
      </span>
    )
  }
  if (!hasChildren) return <span aria-hidden="true" className="h-11 w-11 shrink-0" />
  return (
    <button
      type="button"
      onClick={onToggleExpand}
      aria-label={expanded ? collapseLabel : expandLabel}
      aria-expanded={expanded}
      className="flex h-11 w-11 shrink-0 appearance-none items-center justify-center border-0 bg-transparent text-[var(--fg-3)] transition-[background-color,color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] active:scale-[0.96]"
    >
      <ChevronDown
        size={20}
        strokeWidth={1.8}
        aria-hidden="true"
        style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
      />
    </button>
  )
}

export function HabitRow({
  habit,
  state = 'empty',
  meta = EMPTY_META,
  canLog = true,
  child = false,
  depth = 0,
  selectMode = false,
  selected = false,
  hasChildren = false,
  hasSubHabits = false,
  expanded = false,
  childProgress,
  tourTargetId,
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
  const canDrillInto = hasSubHabits && !!onDrillInto
  const hasMenuActions = hasHabitMenuActions(actions, canSelect, canDrillInto)

  const isDone = state === 'done'
  const isChild = child || depth === 1
  const titleSize = isChild ? 14 : 16
  const emojiSize = isChild ? 16 : 22
  const wellSize = isChild ? 32 : 46
  const wellRadius = 12

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

  const [contextOpen, setContextOpen] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)

  const rowPrimaryAction = selectMode ? onToggleSelection : onDetail

  function handleRowClick() {
    rowPrimaryAction?.()
  }

  function handleToggleStatus() {
    if (isDone) onUnlog?.()
    else onLog?.()
  }

  function handleRowContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target
    if (!(target instanceof Node) || !event.currentTarget.contains(target)) return
    if (contextMenuItems.length === 0) return
    event.preventDefault()
    setContextOpen(true)
  }

  function getTitleColor(): string {
    if (isDone) return 'var(--fg-3)'
    return isChild ? 'var(--fg-2)' : 'var(--fg-1)'
  }

  const row = (
    <div
      ref={rowRef}
      data-tour={tourTargetId}
      data-testid="habit-row"
      data-habit-title={habit.title}
      data-depth={depth}
      data-status={state}
      onContextMenuCapture={handleRowContextMenu}
      className={`relative flex items-center ${selected ? 'bg-[var(--selection-bg)]' : ''}`}
      style={{
        minHeight: isChild ? 52 : 68,
        paddingInlineStart: isChild ? 24 : 0,
      }}
    >
      <HabitRowStructuralColumn
        selectMode={selectMode}
        selected={selected}
        title={habit.title}
        hasChildren={hasChildren}
        expanded={expanded}
        onToggleSelection={onToggleSelection}
        onToggleExpand={onToggleExpand}
        collapseLabel={t('common.collapse')}
        expandLabel={t('common.expand')}
      />

      <button
        type="button"
        onClick={handleRowClick}
        className="flex min-w-0 flex-1 items-center self-stretch appearance-none border-0 bg-transparent text-left transition-[background-color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--primary)]"
        style={{ gap: 12, paddingBlock: isChild ? 4 : 8 }}
      >
        <HabitRowLeading
          title={habit.title}
          emoji={habit.emoji}
          emojiSize={emojiSize}
          wellSize={wellSize}
          wellRadius={wellRadius}
        />

        <HabitRowContent
          habit={habit}
          titleSize={titleSize}
          titleColor={getTitleColor()}
          isDone={isDone}
          meta={meta}
        />
      </button>

      <HabitRowTrailing
        habit={habit}
        selectMode={selectMode}
        hasChildren={hasChildren}
        childProgress={childProgress}
        depth={depth}
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
      <Menu
        open={contextOpen}
        presentation="anchored"
        anchorRef={rowRef}
        title={t('habits.actions.more')}
        items={contextMenuItems.map(({ onRun: _onRun, ...item }) => item)}
        onClose={() => setContextOpen(false)}
        onSelect={(id) => contextMenuItems.find((item) => item.id === id)?.onRun()}
      />
    </>
  )
}
