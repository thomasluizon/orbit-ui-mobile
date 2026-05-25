'use client'

import { Fragment, type MouseEvent, type ReactNode } from 'react'
import { ChevronDown, MoreVertical, Pencil, Copy, FolderInput, Plus, SkipForward, Trash2, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { ParentRing } from '@/components/ui/parent-ring'
import { Popover } from '@/components/ui/popover'
import { SelectCheck } from '@/components/ui/select-check'
import { StatusDot, type StatusDotState } from '@/components/ui/status-dot'

/** Action callbacks consumed by HabitRow. Mirrors the mobile shape so that
 *  cross-platform call sites can pass the same handler bag. */
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
}

/** Inline meta token rendered between dots in the row's meta strip.
 *  String tokens render in fg-3; tagged tokens get status color. */
export type HabitRowMetaToken =
  | string
  | { kind: 'overdue'; label: string }
  | { kind: 'bad'; label: string }

/** Linear-tight habit row. Single line: emoji / chevron / title / inline meta / status dot / streak.
 *  Sub-habit rows ("child") render a tree-line connector to the parent column. */
interface HabitRowProps {
  habit: NormalizedHabit
  /** Derived display state (computed by caller from instances/logs). */
  state?: StatusDotState
  /** Inline tokens between title and trailing dot (frequency, time, X/Y checklist, overdue, bad). */
  meta?: HabitRowMetaToken[]
  /** Streak number from `habit.currentStreak` — only rendered when >= 2 and not child. */
  streak?: number
  /** True when this row is rendered under a parent. Renders with smaller text. */
  child?: boolean
  /** Last child in a sibling group — closes the elevated parent block with a rounded bottom. */
  isLastChild?: boolean
  selectMode?: boolean
  selected?: boolean
  /** Parent expand/collapse. Caller is responsible for managing expanded state. */
  hasChildren?: boolean
  expanded?: boolean
  /** When the row is a parent, displays a ParentRing instead of StatusDot. */
  childProgress?: { done: number; total: number }
  /** Whether to render the small linked-goal indicator (5px primary dot before the status). */
  showLinkedGoalDot?: boolean
  /** Optional data attribute (`data-tour-target`) used by the feature tour. */
  tourTargetId?: string
  actions?: HabitRowActions
}

export function HabitRow({
  habit,
  state = 'empty',
  meta = [],
  streak,
  child = false,
  isLastChild = false,
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
    onDelete,
  } = actions
  const hasMenuActions = !!(onEdit || onDuplicate || onMoveParent || onAddSubHabit || onSkip || onDelete)

  const isDone = state === 'done'
  const isSkip = state === 'skip'
  const titleSize = child ? 14 : 17
  const emojiSize = child ? 16 : 18
  const showStreak = !child && streak != null && streak >= 2

  // Every habit row is a --bg-elev card. Parent + expanded children share one
  // card via radius (parent top-rounded, last child bottom-rounded, middles
  // square). Standalones get a fully rounded card. Whitespace below separates
  // adjacent blocks — no internal or inter-row hairlines.
  const isGroupStart = hasChildren && expanded && !child
  const isGroupEnd = child && isLastChild
  const isGroupMiddle = child && !isLastChild
  const closesBlock = !child && !isGroupStart // standalone (no children expanded)

  const groupBorderRadius = isGroupStart
    ? '10px 10px 0 0'
    : isGroupEnd
      ? '0 0 10px 10px'
      : isGroupMiddle
        ? '0'
        : '10px'

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

  return (
    <div
      onClick={handleRowClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleRowClick()
        }
      }}
      data-tour-target={tourTargetId}
      className="relative flex items-center cursor-pointer"
      style={{
        gap: 10,
        padding: `12px 20px`,
        background: selected ? 'var(--bg-sunk)' : 'var(--bg-elev)',
        borderRadius: groupBorderRadius,
        marginBottom: closesBlock || isGroupEnd ? 8 : 0,
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
          className="appearance-none border-0 bg-transparent cursor-pointer p-0 flex shrink-0"
          style={{
            color: 'var(--fg-3)',
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform var(--dur-base) var(--ease-standard)',
          }}
        >
          <ChevronDown size={14} />
        </button>
      )}

      {habit.emoji && (
        <span
          aria-hidden="true"
          className="shrink-0"
          style={{ fontSize: emojiSize, lineHeight: 1 }}
        >
          {habit.emoji}
        </span>
      )}

      <div
        className="flex-1 min-w-0 flex items-baseline"
        style={{ gap: 8 }}
      >
        <TitleText
          title={habit.title}
          size={titleSize}
          color={getTitleColor()}
          strikethrough={isDone}
        />
        {meta.length > 0 && (
          <MetaStrip tokens={meta} />
        )}
      </div>

      <div className="flex items-center shrink-0" style={{ gap: 10 }}>
        {showLinkedGoalDot && (
          <span
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
          hasChildren && childProgress ? (
            <ParentRing
              done={childProgress.done}
              total={childProgress.total}
              size={14}
              ariaLabel={t('goals.progress')}
            />
          ) : (
            <StatusDot
              state={state}
              size={22}
              onToggle={handleToggleStatus}
              ariaLabel={t(`habits.statusDot.${state}` as Parameters<typeof t>[0])}
            />
          )
        )}
        {showStreak && !selectMode && (
          <span
            className="text-right"
            style={{
              fontFamily: 'var(--font-family-mono)',
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--fg-2)',
              fontVariantNumeric: 'tabular-nums',
              minWidth: 18,
            }}
          >
            {streak}
          </span>
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
                className="appearance-none border-0 bg-transparent flex items-center justify-center"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  color: 'var(--fg-3)',
                  cursor: 'pointer',
                }}
              >
                <MoreVertical size={16} />
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
                onDelete={onDelete}
                t={t}
              />
            )}
          </Popover>
        )}
      </div>
    </div>
  )
}

interface HabitRowMenuProps {
  close: () => void
  onEdit?: () => void
  onDuplicate?: () => void
  onAddSubHabit?: () => void
  onMoveParent?: () => void
  onSkip?: () => void
  onDelete?: () => void
  t: ReturnType<typeof useTranslations>
}

function HabitRowMenu({
  close,
  onEdit,
  onDuplicate,
  onAddSubHabit,
  onMoveParent,
  onSkip,
  onDelete,
  t,
}: Readonly<HabitRowMenuProps>) {
  function run(handler?: () => void) {
    return () => {
      handler?.()
      close()
    }
  }

  return (
    <div role="menu">
      {onEdit && <MenuItem icon={Pencil} label={t('common.edit')} onClick={run(onEdit)} />}
      {onDuplicate && <MenuItem icon={Copy} label={t('habits.actions.duplicate')} onClick={run(onDuplicate)} />}
      {onAddSubHabit && <MenuItem icon={Plus} label={t('habits.form.addSubHabit')} onClick={run(onAddSubHabit)} />}
      {onMoveParent && <MenuItem icon={FolderInput} label={t('habits.moveParent.button')} onClick={run(onMoveParent)} />}
      {onSkip && <MenuItem icon={SkipForward} label={t('habits.actions.skip')} onClick={run(onSkip)} />}
      {onDelete && <MenuItem icon={Trash2} label={t('habits.deleteHabit')} onClick={run(onDelete)} destructive />}
    </div>
  )
}

interface MenuItemProps {
  icon: LucideIcon
  label: string
  onClick: () => void
  destructive?: boolean
}

function MenuItem({ icon: Icon, label, onClick, destructive = false }: Readonly<MenuItemProps>) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="appearance-none border-0 bg-transparent w-full flex items-center text-left transition-colors hover:bg-[var(--bg-sunk)]"
      style={{
        gap: 10,
        padding: '8px 12px',
        color: destructive ? 'var(--status-bad)' : 'var(--fg-1)',
        fontFamily: 'var(--font-family-sans)',
        fontSize: 14,
        cursor: 'pointer',
      }}
    >
      <Icon size={14} strokeWidth={1.6} />
      <span>{label}</span>
    </button>
  )
}

interface TitleTextProps {
  title: string
  size: number
  color: string
  strikethrough: boolean
}

function TitleText({ title, size, color, strikethrough }: Readonly<TitleTextProps>) {
  return (
    <span
      className="flex-shrink min-w-0 overflow-hidden whitespace-nowrap text-ellipsis"
      style={{
        fontFamily: 'var(--font-family-sans)',
        fontSize: size,
        fontWeight: 400,
        color,
        textDecorationLine: strikethrough ? 'line-through' : 'none',
        textDecorationStyle: 'solid',
        textDecorationColor: 'var(--hairline-strong)',
        textDecorationThickness: 1,
        lineHeight: 1.25,
        letterSpacing: '-0.005em',
      }}
    >
      {title}
    </span>
  )
}

interface MetaStripProps {
  tokens: HabitRowMetaToken[]
}

function MetaStrip({ tokens }: Readonly<MetaStripProps>) {
  return (
    <span
      className="shrink-0 overflow-hidden whitespace-nowrap text-ellipsis"
      style={{
        fontFamily: 'var(--font-family-sans)',
        fontSize: 13,
        color: 'var(--fg-3)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span style={{ margin: '0 4px', color: 'var(--fg-4)' }}>·</span>
      {tokens.map((token, i) => (
        <Fragment key={metaTokenKey(token, i)}>
          {i > 0 && <span style={{ margin: '0 6px', color: 'var(--fg-4)' }}>·</span>}
          {renderMetaToken(token)}
        </Fragment>
      ))}
    </span>
  )
}

function metaTokenKey(token: HabitRowMetaToken, index: number): string {
  if (typeof token === 'string') return `s:${index}:${token}`
  return `${token.kind}:${index}`
}

function renderMetaToken(token: HabitRowMetaToken): ReactNode {
  if (typeof token === 'string') return token
  return <span style={{ fontStyle: 'italic' }}>{token.label.toLowerCase()}</span>
}
