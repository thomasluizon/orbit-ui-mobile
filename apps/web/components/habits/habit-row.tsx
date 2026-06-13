'use client'

import { Fragment, useState, type MouseEvent, type ReactNode } from 'react'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  FastForward,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { stripInlineMarkdown } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { ParentRing } from '@/components/ui/parent-ring'
import { Popover } from '@/components/ui/popover'
import { SelectCheck } from '@/components/ui/select-check'
import type { StatusDotState } from '@/components/ui/status-dot'

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
  | { kind: 'future'; label: string }

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
      data-tour={tourTargetId}
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
}

interface HabitRowMenuProps {
  close: () => void
  onEdit?: () => void
  onDuplicate?: () => void
  onAddSubHabit?: () => void
  onMoveParent?: () => void
  onSkip?: () => void
  onDelete?: () => void
  onEnterSelectMode?: () => void
  onDrillInto?: () => void
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
  onEnterSelectMode,
  onDrillInto,
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
      {onAddSubHabit && <MenuItem icon={Plus} label={t('habits.form.addSubHabit')} onClick={run(onAddSubHabit)} />}
      {onMoveParent && <MenuItem icon={ArrowRight} label={t('habits.moveParent.button')} onClick={run(onMoveParent)} />}
      {onSkip && <MenuItem icon={FastForward} label={t('habits.actions.skip')} onClick={run(onSkip)} tone="warning" />}
      {onEdit && <MenuItem icon={Pencil} label={t('common.edit')} onClick={run(onEdit)} />}
      {onDuplicate && <MenuItem icon={Copy} label={t('habits.actions.duplicate')} onClick={run(onDuplicate)} />}
      {onEnterSelectMode && <MenuItem icon={CheckCircle2} label={t('common.select')} onClick={run(onEnterSelectMode)} />}
      {onDelete && (
        <>
          <div
            aria-hidden="true"
            style={{
              height: 1,
              margin: '4px 8px',
              background: 'var(--hairline)',
            }}
          />
          <MenuItem icon={Trash2} label={t('habits.deleteHabit')} onClick={run(onDelete)} tone="danger" />
        </>
      )}
      {onDrillInto && <MenuItem icon={ChevronRight} label={t('habits.actions.openSubHabits')} onClick={run(onDrillInto)} />}
    </div>
  )
}

interface MenuItemProps {
  icon: LucideIcon
  label: string
  onClick: () => void
  tone?: 'default' | 'warning' | 'danger'
}

function MenuItem({ icon: Icon, label, onClick, tone = 'default' }: Readonly<MenuItemProps>) {
  const color =
    tone === 'danger'
      ? 'var(--status-bad)'
      : tone === 'warning'
        ? 'var(--status-overdue)'
        : 'var(--fg-1)'
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className="appearance-none border-0 bg-transparent w-full flex items-center text-left transition-colors hover:bg-[var(--bg-sunk)]"
      style={{
        gap: 10,
        padding: '8px 12px',
        color,
        fontFamily: 'var(--font-sans)',
        fontSize: 14,
        cursor: 'pointer',
      }}
    >
      <Icon size={14} strokeWidth={1.8} />
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
      className="flex-shrink min-w-0 overflow-hidden line-clamp-2"
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: size,
        fontWeight: 500,
        color,
        textDecorationLine: strikethrough ? 'line-through' : 'none',
        textDecorationStyle: 'solid',
        textDecorationColor: 'var(--fg-4)',
        textDecorationThickness: 1,
        lineHeight: 1.25,
        letterSpacing: '-0.005em',
        overflowWrap: 'anywhere',
      }}
    >
      {title}
    </span>
  )
}

const CHECK_FILLED_STATES: ReadonlySet<StatusDotState> = new Set(['done', 'skip', 'frozen'])

const CHECK_COLOR_VAR: Record<StatusDotState, string> = {
  done: 'var(--status-done)',
  empty: 'var(--status-empty)',
  skip: 'var(--status-skip)',
  overdue: 'var(--status-overdue)',
  bad: 'var(--status-bad)',
  frozen: 'var(--status-frozen)',
}

interface CheckCircleProps {
  state: StatusDotState
  /** 'bad' fills the logged circle in status-bad instead of status-done. */
  tone?: 'default' | 'bad'
  onToggle: () => void
  disabled: boolean
  ariaLabel: string
}

function CheckCircle({ state, tone = 'default', onToggle, disabled, ariaLabel }: Readonly<CheckCircleProps>) {
  const filled = CHECK_FILLED_STATES.has(state)
  const color =
    tone === 'bad' && state === 'done' ? 'var(--status-bad)' : CHECK_COLOR_VAR[state]
  const [previousFilled, setPreviousFilled] = useState(filled)
  const [justCompleted, setJustCompleted] = useState(false)
  if (filled !== previousFilled) {
    setPreviousFilled(filled)
    setJustCompleted(filled)
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        if (disabled) return
        onToggle()
      }}
      disabled={disabled}
      aria-disabled={disabled}
      aria-label={ariaLabel}
      className={`appearance-none border-0 bg-transparent shrink-0 flex items-center justify-center ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
      style={{ padding: 7, margin: -7, opacity: disabled ? 0.4 : 1 }}
    >
      <span
        className={`flex items-center justify-center rounded-full transition-transform duration-[160ms] ease-[var(--ease-standard)] ${disabled ? '' : 'hover:scale-105 active:scale-95'} ${justCompleted ? 'animate-check-pop' : ''}`}
        style={{
          width: 30,
          height: 30,
          background: filled ? color : 'transparent',
          boxShadow: filled
            ? state === 'done'
              ? tone === 'bad'
                ? '0 4px 14px color-mix(in srgb, var(--status-bad) 35%, transparent)'
                : '0 4px 14px rgba(var(--primary-rgb), 0.35)'
              : 'none'
            : `inset 0 0 0 2px ${color}`,
        }}
      >
        {filled && <Check size={17} strokeWidth={3} color="var(--fg-on-primary)" aria-hidden="true" />}
      </span>
    </button>
  )
}

interface MetaStripProps {
  tokens: HabitRowMetaToken[]
}

function MetaStrip({ tokens }: Readonly<MetaStripProps>) {
  return (
    <span
      className="min-w-0 overflow-hidden whitespace-nowrap text-ellipsis"
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        color: 'var(--fg-3)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {tokens.map((token, i) => (
        <Fragment key={metaTokenKey(token, i)}>
          {i > 0 && <span style={{ margin: '0 6px', color: 'var(--fg-3)' }}>·</span>}
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
  const color = token.kind === 'overdue' ? 'var(--status-overdue-text)' : undefined
  return <span style={color ? { color, fontWeight: 500 } : {}}>{token.label}</span>
}
