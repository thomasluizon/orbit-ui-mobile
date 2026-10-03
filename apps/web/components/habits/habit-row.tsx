'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { HabitStatus } from '@orbit/shared/contracts/lists'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { ChevronDown } from '@/components/ui/icons'
import { Checkbox } from '@/components/ui/checkbox'
import { HabitRowContent, MetaStrip, type HabitRowMetaToken } from './habit-row-content'
import { HabitRowLeading } from './habit-row-leading'
import { HabitRowTrailing } from './habit-row-trailing'
import { useHabitRowLargeText } from './use-habit-row-large-text'

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
  /** Whether completion is blocked on the selected day. */
  completionReadOnly?: boolean
  completionReason?: string
  completionStatusUnavailable?: boolean
  /** Streak number from `habit.currentStreak` — only rendered when >= 2 and not child. */
  streak?: number
  /** True when this row is rendered under a parent. Renders with smaller text. */
  child?: boolean
  /** Two inline display levels. Deeper data descendants are clamped to level 1 by the list. */
  depth?: 0 | 1
  structuralColumn?: boolean
  selectMode?: boolean
  selected?: boolean
  /** Parent expand/collapse. Caller is responsible for managing expanded state. */
  hasChildren?: boolean
  /** Whether this habit truly has sub-habits (backend-computed, independent of the
   *  current view's visibility filtering). Gates the "go to sub-habits" drill action. */
  hasSubHabits?: boolean
  expanded?: boolean
  childPanelId?: string
  /** When the row is a parent, displays a ParentRing instead of StatusDot. */
  childProgress?: { done: number; total: number }
  /** Whether to render the small linked-goal indicator (5px primary dot before the status). */
  showLinkedGoalDot?: boolean
  hasProAccess?: boolean
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
  hasChildren,
  expanded,
  childPanelId,
  onToggleExpand,
  collapseLabel,
  expandLabel,
}: Readonly<{
  hasChildren: boolean
  expanded: boolean
  childPanelId?: string
  onToggleExpand?: () => void
  collapseLabel: string
  expandLabel: string
}>) {
  if (!hasChildren) return null
  return (
    <button
      type="button"
      onClick={() => onToggleExpand?.()}
      data-habit-row-control="disclosure"
      aria-label={expanded ? collapseLabel : expandLabel}
      aria-expanded={expanded}
      aria-controls={childPanelId}
      className="flex min-h-[48px] w-[48px] shrink-0 appearance-none items-center justify-center rounded-full border-0 bg-transparent text-[var(--fg-3)] transition-[background-color,transform] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] cursor-pointer active:scale-[0.96]"
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
  completionReadOnly = false,
  completionReason,
  completionStatusUnavailable = false,
  child = false,
  depth = 0,
  structuralColumn = false,
  selectMode = false,
  selected = false,
  hasChildren = false,
  hasSubHabits = false,
  expanded = false,
  childPanelId,
  childProgress,
  hasProAccess = true,
  actions = EMPTY_ACTIONS,
}: Readonly<HabitRowProps>) {
  const t = useTranslations()
  const largeText = useHabitRowLargeText()
  const supportingMeta = largeText && !!childProgress
  const {
    onDetail,
    onToggleSelection,
    onLog,
    onUnlog,
    onToggleExpand,
    onEnterSelectMode,
    onDrillInto,
  } = actions
  const canSelect = !selectMode && !!onEnterSelectMode
  const canDrillInto = hasSubHabits && !!onDrillInto
  const hasMenuActions = hasHabitMenuActions(actions, canSelect, canDrillInto)

  const isDone = state === 'done'
  const isChild = child || depth === 1
  const titleSize = isChild ? 14 : 17
  const emojiSize = isChild ? 16 : 22
  const wellSize = isChild ? 32 : 46
  const wellRadius = 12

  const rowPadding = habitRowPadding(isChild, largeText)
  const rowPrimaryAction = selectMode ? onToggleSelection : onDetail

  function handleRowClick() {
    rowPrimaryAction?.()
  }

  function handleToggleStatus() {
    if (completionReadOnly || (!canLog && !isDone)) return
    if (isDone) onUnlog?.()
    else onLog?.()
  }

  function getTitleColor(): string {
    return isChild ? 'var(--fg-2)' : 'var(--fg-1)'
  }

  const rowContents = (
    <>
      <button
        type="button"
        onClick={handleRowClick}
        data-habit-row-body=""
        className="flex min-w-0 flex-1 items-center self-stretch overflow-hidden rounded-[20px] appearance-none border-0 bg-transparent text-left transition-[background-color,transform] duration-[var(--dur-hover)] ease-[var(--ease-standard)] active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--primary)]"
        style={{ gap: 12, paddingBlock: rowPadding, paddingInlineStart: 0, alignItems: largeText ? 'flex-start' : undefined }}
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
          meta={supportingMeta ? meta.filter((token) => typeof token !== 'string' && token.kind === 'future') : meta}
        />
      </button>

      {structuralColumn && selectMode ? (
        <button type="button" data-habit-row-control="selection" aria-label={habit.title}
          aria-pressed={selected} onClick={() => onToggleSelection?.()}
          className="flex min-h-[48px] w-[48px] shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 transition-[background-color,transform] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] active:scale-[0.96]">
          <Checkbox checked={selected} onChange={() => onToggleSelection?.()} as="span" />
        </button>
      ) : null}
      {structuralColumn ? (
        <HabitRowStructuralColumn
          hasChildren={hasChildren}
          expanded={expanded}
          childPanelId={childPanelId}
          onToggleExpand={onToggleExpand}
          collapseLabel={t('common.collapse')}
          expandLabel={t('common.expand')}
        />
      ) : null}

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
        hasProAccess={hasProAccess}
        onToggleStatus={handleToggleStatus}
        completionReadOnly={completionReadOnly}
        completionReason={completionReason}
        completionStatusUnavailable={completionStatusUnavailable}
      />
    </>
  )

  return (
    <HabitRowLayout habitTitle={habit.title} depth={depth} state={state} selected={selected}
      largeText={largeText} isChild={isChild} supportingMeta={supportingMeta} meta={meta}>
      {rowContents}
    </HabitRowLayout>
  )
}

function HabitRowLayout({ habitTitle, depth, state, selected, largeText, isChild, supportingMeta, meta, children }: Readonly<{
  habitTitle: string
  depth: 0 | 1
  state: HabitStatus
  selected: boolean
  largeText: boolean
  isChild: boolean
  supportingMeta: boolean
  meta: HabitRowMetaToken[]
  children: ReactNode
}>) {
  const minHeight = isChild ? 52 : 68
  return (
    <div data-testid="habit-row" data-habit-title={habitTitle} data-depth={depth} data-status={state} tabIndex={-1}
      className={`relative flex ${largeText ? 'flex-col' : 'items-center gap-[4px]'} ${selected ? 'bg-[var(--selection-bg)]' : ''}`}
      style={{ minHeight }}>
      {largeText ? (
        <div className="flex w-full items-start gap-[4px]" style={{ minHeight, paddingBlockStart: isChild ? 4 : 8 }}>
          {children}
        </div>
      ) : children}
      {supportingMeta ? (
        <div className="flex w-full min-w-0 gap-[12px]" style={{ paddingBlockEnd: 8 }}>
          <span className="w-[48px] shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1"><MetaStrip tokens={meta.filter((token) => typeof token === 'string' || token.kind !== 'future')} expanded /></div>
        </div>
      ) : null}
    </div>
  )
}

function habitRowPadding(isChild: boolean, largeText: boolean): number {
  if (largeText) return 0
  return isChild ? 4 : 8
}
