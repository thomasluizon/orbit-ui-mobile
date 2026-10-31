'use client'

import { SPACING } from '@orbit/shared/theme'

import { useId, type CSSProperties, type KeyboardEvent, type ReactNode, type RefCallback } from 'react'
import { getHabitRowTypeLabelKey, isHabitDoneForRange, stripInlineMarkdown } from '@orbit/shared/utils'
import { PersonalTextAction } from '@/components/ui/personal-text-action'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useTranslations } from 'next-intl'
import type { HabitRowBase, HabitStatus } from '@orbit/shared/contracts/lists'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { ChevronDown } from '@/components/ui/icons'
import { Checkbox } from '@/components/ui/checkbox'
import { buildHabitRowMetaTokens, HabitRowContent, MetaStrip, type HabitRowMetaToken } from './habit-row-content'
import { HabitRowLeading } from './habit-row-leading'
import { HabitRowTrailing } from './habit-row-trailing'
import { useHabitRowSupportingMeta, useHabitRowMetadataFit } from './use-habit-row-large-text'
import { useHabitRowActivation } from './use-habit-row-activation'

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
  onReorder?: (direction: -1 | 1) => void
}

/** Canonical habit row. List grouping owns its surrounding panel. */
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
  /** Visible depth relative to the current list context; each ancestor adds one spacing step. */
  depth?: HabitRowBase['depth']
  drillInsteadOfExpand?: boolean
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
  reorderInstructionsId?: string
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
  drillInsteadOfExpand,
  expanded,
  childPanelId,
  onToggleExpand,
  collapseLabel,
  expandLabel,
  drillLabel,
}: Readonly<{
  hasChildren: boolean
  drillInsteadOfExpand: boolean
  expanded: boolean
  childPanelId?: string
  onToggleExpand?: () => void
  collapseLabel: string
  expandLabel: string
  drillLabel: string
}>) {
  if (!hasChildren) return null
  return (
    <button
      type="button"
      onClick={() => onToggleExpand?.()}
      data-habit-row-control="disclosure"
      aria-label={drillInsteadOfExpand ? drillLabel : expanded ? collapseLabel : expandLabel}
      aria-expanded={drillInsteadOfExpand ? undefined : expanded}
      aria-controls={drillInsteadOfExpand ? undefined : childPanelId}
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

export function HabitRow(props: Readonly<HabitRowProps>) {
  return props.habit.nextReminderAtUtc ? <RepeatHabitRow {...props} /> : <HabitRowView {...props} />
}

function RepeatHabitRow(props: Readonly<HabitRowProps>) {
  const t = useTranslations()
  const { displayReminderClock: displayClock } = useTimeFormat()
  const next = props.habit.nextReminderAtUtc
  return <HabitRowView {...props} meta={[...(props.meta ?? EMPTY_META), ...(next ? [t('habits.nextReminder', { time: displayClock(next) })] : [])]} />
}

function HabitRowView({
  habit,
  state = 'empty',
  meta: supplementalMeta = EMPTY_META,
  canLog = true,
  completionReadOnly = false,
  completionReason,
  completionStatusUnavailable = false,
  child = false,
  depth = Number(child),
  drillInsteadOfExpand = false,
  structuralColumn = false,
  selectMode = false,
  selected = false,
  hasChildren = false,
  hasSubHabits = false,
  expanded = false,
  childPanelId,
  childProgress,
  reorderInstructionsId,
  actions = EMPTY_ACTIONS,
}: Readonly<HabitRowProps>) {
  const t = useTranslations()
  const meta = buildHabitRowMetaTokens(habit, supplementalMeta, t)
  const { supportingMeta: depthSupportingMeta, measureRef, largeText } = useHabitRowSupportingMeta(depth)
  const descriptionId = useDescriptionId(habit.description)
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
  const { rowRef, narrow } = useHabitRowMetadataFit(JSON.stringify([habit.id, meta, selectMode, selected, structuralColumn, hasChildren, hasMenuActions, child, depth, depthSupportingMeta]), largeText, measureRef)
  const supportingMeta = depthSupportingMeta || narrow

  const isDone = state === 'done' || isHabitDoneForRange(habit)
  const graphicState = habit.isBadHabit ? 'bad' : state
  const isChild = child || depth > 0
  const titleSize = isChild ? 14 : 17
  const emojiSize = isChild ? 16 : 22
  const wellSize = isChild ? 32 : 46
  const wellRadius = 12

  const rowPadding = habitRowPadding(isChild, supportingMeta, largeText)
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

  const primaryContent = (
    <>
      <HabitRowLeading
        title={habit.title}
        emoji={habit.emoji}
        emojiSize={emojiSize}
        wellSize={wellSize}
        wellRadius={wellRadius}
      />

      <HabitRowContent expanded={selectMode && selected}
        descriptionId={descriptionId}
        typeOnSupportingLine={supportingMeta}
        largeText={largeText}
        habit={habit}
        titleSize={titleSize}
        titleColor={getTitleColor()}
        meta={supportingMeta ? meta.filter((token) => typeof token !== 'string' && token.kind === 'future') : meta}
      />
    </>
  )
  const controls = (
    <>
      {structuralColumn && selectMode ? (
        <button type="button" data-habit-row-control="selection" aria-label={`${habit.title}, ${meta.filter((token) => typeof token !== 'string' && (token.kind === 'type' || token.kind === 'checklist')).map((token) => typeof token === 'string' ? token : token.label).join(' ')}`}
          aria-pressed={selected} onClick={() => onToggleSelection?.()}
          className="flex min-h-[48px] w-[48px] shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 transition-[background-color,transform] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] active:scale-[0.96]">
          <Checkbox checked={selected} onChange={() => onToggleSelection?.()} as="span" />
        </button>
      ) : null}
      {structuralColumn ? (
        <HabitRowStructuralColumn
          hasChildren={hasChildren}
          drillInsteadOfExpand={drillInsteadOfExpand}
          drillLabel={t('habits.actions.openSubHabits')}
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
        state={graphicState}
        isDone={isDone}
        canLog={canLog}
        hasMenuActions={hasMenuActions}
        canSelect={canSelect}
        canDrillInto={canDrillInto}
        actions={actions}
        onToggleStatus={handleToggleStatus}
        completionReadOnly={completionReadOnly}
        completionReason={completionReason}
        completionStatusUnavailable={completionStatusUnavailable}
      />
    </>
  )
  const rowContents = (
    <>
      <HabitRowPrimaryButton onClick={handleRowClick} supportingMeta={supportingMeta}
        descriptionId={descriptionId}
        largeText={largeText} isChild={isChild} rowPadding={rowPadding} meta={meta} independentText={selectMode} label={`${habit.title}, ${t(getHabitRowTypeLabelKey(habit))}`}
        onReorder={actions.onReorder} reorderInstructionsId={reorderInstructionsId}>
        {primaryContent}
      </HabitRowPrimaryButton>
      {supportingMeta ? <div data-habit-row-controls="" className="pointer-events-none *:pointer-events-auto relative col-start-2 row-start-1 flex items-start gap-[4px]" style={{ paddingBlockStart: isChild ? SPACING.s4 : SPACING.s8 }}>{controls}</div> : <div data-habit-row-controls="" className="flex shrink-0 items-center gap-[4px]">{controls}</div>}
    </>
  )

  return (
    <HabitRowLayout measureRef={rowRef} habitId={habit.id} habitTitle={habit.title} depth={depth} state={graphicState} selected={selected}
      isChild={isChild} supportingMeta={supportingMeta}>
      {rowContents}
    </HabitRowLayout>
  )
}

function useDescriptionId(description: NormalizedHabit['description']) {
  const id = useId()
  return stripInlineMarkdown(description ?? '') ? id : undefined
}

function HabitRowPrimaryButton({ onClick, supportingMeta, largeText, isChild, rowPadding, meta, onReorder, reorderInstructionsId, children, independentText, label, descriptionId }: Readonly<{
  onClick: () => void
  independentText: boolean
  label: string
  descriptionId?: string
  supportingMeta: boolean
  largeText: boolean
  isChild: boolean
  rowPadding: CSSProperties
  meta: HabitRowMetaToken[]
  onReorder?: (direction: -1 | 1) => void
  reorderInstructionsId?: string
  children: ReactNode
}>) {
  const t = useTranslations()
  const contentId = useId()
  const activation = useHabitRowActivation(onClick)
  const reorder = habitRowReorderProps(onReorder)
  const accessibleLabel = [label, meta.filter((token) => typeof token === 'string' || token.kind !== 'type').map((token) => typeof token === 'string' ? token : token.label).join('·')].filter(Boolean).join(' ')
  const layoutClass = supportingMeta ? 'grid grid-cols-subgrid grid-rows-subgrid' : 'flex'
  const control = (
      <button
        type="button"
        {...reorder}
        {...activation}
        onKeyDown={(event) => {
          reorder.onKeyDown?.(event)
          if (!event.defaultPrevented) activation.onKeyDown(event)
        }}
        data-habit-row-body=""
        aria-label={accessibleLabel}
        aria-roledescription={onReorder ? t('dragAndDrop.roleDescription') : undefined}
        aria-describedby={[descriptionId, reorderInstructionsId].filter(Boolean).join(' ')}
        className={`${layoutClass} col-start-1 col-span-full row-start-1 row-span-2 min-w-0 flex-1 items-center self-stretch overflow-hidden rounded-[20px] appearance-none border-0 bg-transparent text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--primary)]`}
        style={rowPadding}
      >
        {supportingMeta ? (
          <div data-habit-row-heading="" className="col-start-1 row-start-1 flex min-w-0 items-start" style={{ gap: 12, minHeight: isChild ? 52 : 68, paddingBlockStart: isChild ? SPACING.s4 : SPACING.s8, paddingBlockEnd: descriptionId ? SPACING.s4 : undefined }}>
            {children}
          </div>
        ) : children}
        {supportingMeta ? <HabitRowSupportingFooter meta={meta} largeText={largeText} descriptionPresent={Boolean(descriptionId)} /> : null}
      </button>
  )
  return independentText ? <PersonalTextAction label={accessibleLabel} contentId={contentId} className={supportingMeta ? 'col-start-1 col-span-full row-start-1 row-span-2 grid grid-cols-subgrid grid-rows-subgrid' : 'flex-1 self-stretch'} contentClassName={`${layoutClass} col-start-1 col-span-full row-start-1 row-span-2 min-w-0 items-center self-stretch rounded-[20px] text-left`} contentStyle={rowPadding} control={control} /> : control
}

function HabitRowSupportingFooter({ meta, largeText, descriptionPresent }: Readonly<{
  largeText: boolean
  meta: HabitRowMetaToken[]
  descriptionPresent: boolean
}>) {
  const supportingTokens = meta.filter((token) => typeof token === 'string' || token.kind !== 'future')
  return (
    <div className="col-span-full row-start-2 flex min-w-0" style={{ gap: 12, paddingInlineEnd: SPACING.s8, paddingBlockStart: descriptionPresent ? SPACING.s0 : SPACING.s4, paddingBlockEnd: SPACING.s8 }}>
      <span className="w-[48px] shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1"><MetaStrip tokens={supportingTokens} largeText={largeText} /></div>
    </div>
  )
}

function HabitRowLayout({ measureRef, habitId, habitTitle, depth, state, selected, isChild, supportingMeta, children }: Readonly<{
  measureRef: RefCallback<HTMLDivElement>
  habitId: string
  habitTitle: string
  depth: number
  state: HabitStatus
  selected: boolean
  isChild: boolean
  supportingMeta: boolean
  children: ReactNode
}>) {
  const minHeight = isChild ? 52 : 68
  const contentLayoutClass = supportingMeta ? 'grid-cols-[minmax(0,1fr)_auto] gap-x-[4px]' : 'items-center gap-0'
  return (
    <div ref={measureRef}>
      <div data-testid="habit-row" data-habit-id={habitId} data-habit-title={habitTitle} data-depth={depth} data-status={state} tabIndex={-1}
        role="group" aria-label={habitTitle}
        className={`habit-row relative rounded-[20px] ${selected ? 'bg-[var(--selection-bg)]' : 'bg-[var(--bg-card)]'} ${supportingMeta ? 'grid' : 'flex'} ${contentLayoutClass}`}
        style={{ minHeight, marginInlineStart: depth * SPACING.s16 }}>
        {children}
      </div>
    </div>
  )
}

function habitRowReorderProps(onReorder: ((direction: -1 | 1) => void) | undefined) {
  if (!onReorder) return {}
  return {
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
      event.preventDefault()
      onReorder(event.key === 'ArrowUp' ? -1 : 1)
    },
    'aria-keyshortcuts': 'Alt+ArrowUp Alt+ArrowDown',
  }
}

function habitRowPadding(isChild: boolean, supportingMeta: boolean, largeText: boolean): CSSProperties {
  const defaultPaddingBlock = isChild ? SPACING.s4 : SPACING.s8
  return {
    paddingBlock: supportingMeta ? SPACING.s0 : defaultPaddingBlock,
    paddingInlineStart: SPACING.s8,
    paddingInlineEnd: supportingMeta ? SPACING.s0 : SPACING.s4,
    gap: supportingMeta ? undefined : 12,
    rowGap: supportingMeta ? 0 : undefined,
    alignItems: largeText ? 'flex-start' : undefined,
  }
}
