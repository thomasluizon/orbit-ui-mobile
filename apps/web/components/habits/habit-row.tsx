'use client'

import { Fragment, type MouseEvent, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { ParentRing } from '@/components/ui/parent-ring'
import { SelectCheck } from '@/components/ui/select-check'
import { StatusDot, type StatusDotState } from '@/components/ui/status-dot'
import type { HabitCardActions } from './habit-card'

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
  /** True when this row is rendered under a parent (renders tree-line connector + smaller text). */
  child?: boolean
  /** Extra left padding so the parent column aligns; pixel value. */
  indent?: number
  /** Last child in a sibling group — vertical tree line stops at row midpoint. */
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
  actions?: HabitCardActions
}

const TREE_LINE_OFFSET_PX = 12
const TREE_STUB_WIDTH_PX = 8

export function HabitRow({
  habit,
  state = 'empty',
  meta = [],
  streak,
  child = false,
  indent = 0,
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
  const {
    onDetail,
    onToggleSelection,
    onLog,
    onUnlog,
    onToggleExpand,
  } = actions

  const isDone = state === 'done'
  const isSkip = state === 'skip'
  const titleSize = child ? 14 : 17
  const emojiSize = child ? 16 : 18
  const showStreak = !child && streak != null && streak >= 2

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

  // Tree-line geometry: vertical span runs full height (or stops at 50% for the last child)
  // and a horizontal stub anchors to the row midpoint. Both sit at `indent/2 + TREE_LINE_OFFSET_PX`
  // from the row's left edge so they align with the parent emoji column above.
  const treeLineLeft = indent / 2 + TREE_LINE_OFFSET_PX

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
        padding: `${child ? 10 : 13}px 20px ${child ? 10 : 13}px ${20 + indent}px`,
        borderBottom: '1px solid var(--hairline)',
        background: selected ? 'var(--bg-sunk)' : 'transparent',
      }}
    >
      {indent > 0 && (
        <>
          <span
            aria-hidden="true"
            className="absolute"
            style={{
              left: treeLineLeft,
              top: 0,
              bottom: isLastChild ? '50%' : 0,
              width: 1,
              background: 'var(--hairline-strong)',
            }}
          />
          <span
            aria-hidden="true"
            className="absolute"
            style={{
              left: treeLineLeft,
              top: '50%',
              width: TREE_STUB_WIDTH_PX,
              height: 1,
              background: 'var(--hairline-strong)',
            }}
          />
        </>
      )}

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
          aria-label={expanded ? 'Collapse' : 'Expand'}
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
            aria-label="Linked goal"
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
              ariaLabel="Progress"
            />
          ) : (
            <StatusDot
              state={state}
              size={9}
              onToggle={handleToggleStatus}
              ariaLabel={state}
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
      </div>
    </div>
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
        textDecoration: strikethrough ? 'line-through' : 'none',
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
  if (token.kind === 'overdue') {
    return <span style={{ color: 'var(--status-overdue)' }}>{token.label}</span>
  }
  return <span style={{ color: 'var(--status-bad)' }}>{token.label}</span>
}
