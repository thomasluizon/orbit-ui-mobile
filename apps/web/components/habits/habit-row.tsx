'use client'

import { type MouseEvent } from 'react'
import { ChevronDown, MoreVertical } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { stripInlineMarkdown } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { ParentRing } from '@/components/ui/parent-ring'
import { Popover } from '@/components/ui/popover'
import { useContextMenu, type ContextMenuItem } from '@/components/ui/context-menu'
import { SelectCheck } from '@/components/ui/select-check'
import type { StatusDotState } from '@/components/ui/status-dot'
import { CheckCircle } from './habit-row-check-circle'
import { HabitRowMenu } from './habit-row-menu'
import { MetaStrip, TitleText, type HabitRowMetaToken } from './habit-row-content'

export type { HabitRowMetaToken }

const MAX_VISIBLE_TAGS = 3

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
 *  Sub-habit rows ("child") render a tree-line connector to the parent column. */
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
  actions?: HabitRowActions
}

export function HabitRow({
  habit,
  state = 'empty',
  meta = [],
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
  actions = {},
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
    onMoveParent,
    onAddSubHabit,
    onSkip,
    onReschedule,
    onDelete,
    onEnterSelectMode,
    onDrillInto,
  } = actions
  const canSelect = !selectMode && !!onEnterSelectMode
  const canDrillInto = hasChildren && !!onDrillInto
  const hasMenuActions = !!(
    onEdit ||
    onDuplicate ||
    onMoveParent ||
    onAddSubHabit ||
    onSkip ||
    onReschedule ||
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

  const contextMenuItems: ContextMenuItem[] = selectMode
    ? []
    : [
        onLog && !isDone && canLog
          ? { key: 'log', label: t('contextMenu.log'), onSelect: onLog }
          : null,
        onSkip ? { key: 'skip', label: t('contextMenu.skip'), onSelect: onSkip } : null,
        onDetail
          ? { key: 'viewDetails', label: t('contextMenu.viewDetails'), onSelect: onDetail }
          : null,
        onEdit ? { key: 'edit', label: t('contextMenu.edit'), onSelect: onEdit } : null,
        onDuplicate
          ? { key: 'duplicate', label: t('contextMenu.duplicate'), onSelect: onDuplicate }
          : null,
        onAddSubHabit
          ? { key: 'addSubHabit', label: t('contextMenu.addSubHabit'), onSelect: onAddSubHabit }
          : null,
        onDelete
          ? { key: 'delete', label: t('contextMenu.delete'), onSelect: onDelete, danger: true }
          : null,
      ].filter((item): item is ContextMenuItem => item !== null)

  const { onContextMenu, contextMenu } = useContextMenu(contextMenuItems)

  function handleRowClick() {
    if (selectMode) onToggleSelection?.()
    else onDetail?.()
  }

  function handleToggleStatus() {
    if (isDone) onUnlog?.()
    else onLog?.()
  }

  function handleExpand(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    onToggleExpand?.()
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
      className={
        `relative flex items-center cursor-pointer shadow-[inset_0_0_0_1px_var(--hairline)] transition-[background-color,transform,box-shadow] duration-[160ms] ease-[var(--ease-standard)] active:scale-[0.99] ${
          selected
            ? 'bg-[var(--bg-sunk)]'
            : 'bg-[var(--bg-card)] hover:bg-[var(--bg-elev-pressed)] hover:shadow-[inset_0_0_0_1px_var(--hairline-strong)]'
        }`
      }
      style={{
        gap: 14,
        padding: '14px 16px',
        borderRadius: 18,
        marginLeft: 20 + indentPx,
        marginRight: 20,
        marginBottom: 10,
      }}
    >

      {selectMode && (
        <SelectCheck
          selected={selected}
          onClick={onToggleSelection}
          ariaLabel={habit.title}
        />
      )}

      {hasChildren && !selectMode && (
        <button
          type="button"
          onClick={handleExpand}
          aria-label={expanded ? t('common.collapse') : t('common.expand')}
          aria-expanded={expanded}
          className="appearance-none border-0 bg-transparent cursor-pointer flex shrink-0 items-center justify-center text-[var(--fg-3)] transition-[transform,color] duration-150 ease-out hover:text-[var(--fg-1)]"
          style={{
            width: 44,
            height: 44,
            margin: '-15px -14px',
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
          }}
        >
          <ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" />
        </button>
      )}

      <span
        aria-hidden="true"
        className="shrink-0 inline-flex items-center justify-center"
        style={{
          width: wellSize,
          height: wellSize,
          borderRadius: wellRadius,
          background: 'var(--bg-field)',
          fontSize: habit.emoji ? emojiSize : emojiSize - 4,
          lineHeight: 1,
          ...(habit.emoji
            ? {}
            : {
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                color: 'var(--fg-3)',
              }),
        }}
      >
        {habit.emoji ?? [...habit.title.trim().toUpperCase()][0]}
      </span>

      <div
        className="flex-1 min-w-0 flex flex-col"
        style={{ gap: 2 }}
      >
        <TitleText
          title={habit.title}
          size={titleSize}
          color={getTitleColor()}
          strikethrough={isDone}
        />
        {habit.description?.trim() && (
          <span
            className="overflow-hidden whitespace-nowrap text-ellipsis"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: 'var(--fg-3)',
              lineHeight: 1.3,
            }}
          >
            {stripInlineMarkdown(habit.description)}
          </span>
        )}
        {(meta.length > 0 || showStreak) && (
          <span className="flex items-center" style={{ gap: 8 }}>
            {meta.length > 0 && <MetaStrip tokens={meta} />}
            {showStreak && (
              <span
                className="shrink-0"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  color: 'var(--status-overdue-text)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                🔥 {streak}
              </span>
            )}
          </span>
        )}
        {habit.tags.length > 0 && (
          <span className="flex items-center overflow-hidden" style={{ gap: 8, marginTop: 1 }}>
            {habit.tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center shrink-0 min-w-0"
                style={{ gap: 5, maxWidth: 132 }}
              >
                <span
                  aria-hidden="true"
                  className="rounded-full shrink-0"
                  style={{ width: 6, height: 6, background: tag.color }}
                />
                <span
                  className="truncate"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 12,
                    color: 'var(--fg-3)',
                    lineHeight: 1.2,
                  }}
                >
                  {tag.name}
                </span>
              </span>
            ))}
            {habit.tags.length > MAX_VISIBLE_TAGS && (
              <span
                className="shrink-0"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 12,
                  color: 'var(--fg-3)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                +{habit.tags.length - MAX_VISIBLE_TAGS}
              </span>
            )}
          </span>
        )}
      </div>

      <div className="flex items-center shrink-0" style={{ gap: 10 }}>
        {showLinkedGoalDot && (
          <span
            role="img"
            aria-label={t('habits.detail.linkedGoal')}
            className="rounded-full"
            style={{
              width: 5,
              height: 5,
              background: 'var(--primary)',
            }}
          />
        )}
        {!selectMode && (
          hasChildren ? (
            <>
              {childProgress && childProgress.total > 0 && (
                <span
                  aria-hidden="true"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--fg-3)',
                  }}
                >
                  {childProgress.done}/{childProgress.total}
                </span>
              )}
              <button
                type="button"
                aria-label={
                  childProgress
                    ? `${habit.title} ${childProgress.done}/${childProgress.total}`
                    : habit.title
                }
                onClick={(event) => {
                  event.stopPropagation()
                  if (isDone) {
                    actions.onUnlog?.()
                  } else if (
                    childProgress &&
                    childProgress.total > 0 &&
                    childProgress.done >= childProgress.total
                  ) {
                    actions.onLog?.()
                  } else {
                    actions.onForceLogParent?.()
                  }
                }}
                className="appearance-none border-0 bg-transparent flex items-center justify-center cursor-pointer"
                style={{ padding: 7, margin: -7 }}
              >
                <ParentRing
                  done={childProgress?.done ?? 0}
                  total={childProgress?.total ?? 0}
                  size={30}
                  ariaLabel={t('goals.progress')}
                  color={habit.isBadHabit ? 'var(--status-bad)' : undefined}
                  trackColor={
                    habit.isBadHabit
                      ? 'color-mix(in srgb, var(--status-bad) 40%, transparent)'
                      : state === 'overdue'
                        ? 'color-mix(in srgb, var(--status-overdue) 40%, transparent)'
                        : undefined
                  }
                />
              </button>
            </>
          ) : (
            <CheckCircle
              state={state}
              tone={habit.isBadHabit ? 'bad' : 'default'}
              onToggle={handleToggleStatus}
              disabled={!canLog && !isDone}
              ariaLabel={t(`habits.statusDot.${state}` as Parameters<typeof t>[0])}
            />
          )
        )}
        {!selectMode && hasMenuActions && (
          <Popover
            placement="bottom-end"
            className="min-w-[180px]"
            trigger={
              <button
                type="button"
                aria-label={t('habits.actions.more')}
                onClick={(event) => event.stopPropagation()}
                className="appearance-none border-0 bg-transparent flex items-center justify-center rounded-full text-[var(--fg-3)] transition-[background-color,color,transform] duration-[160ms] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev-pressed)] hover:text-[var(--fg-1)] active:scale-90"
                style={{
                  width: 34,
                  height: 34,
                  margin: '-3px',
                  cursor: 'pointer',
                }}
              >
                <MoreVertical size={18} strokeWidth={1.8} />
              </button>
            }
          >
            {(close) => (
              <HabitRowMenu
                close={close}
                onEdit={onEdit}
                onDuplicate={onDuplicate}
                onAddSubHabit={onAddSubHabit}
                onMoveParent={onMoveParent}
                onSkip={onSkip}
                onReschedule={onReschedule}
                onDelete={onDelete}
                onEnterSelectMode={canSelect ? onEnterSelectMode : undefined}
                onDrillInto={canDrillInto ? onDrillInto : undefined}
                t={t}
              />
            )}
          </Popover>
        )}
      </div>
    </div>
  )

  return (
    <>
      {row}
      {contextMenu}
    </>
  )
}
