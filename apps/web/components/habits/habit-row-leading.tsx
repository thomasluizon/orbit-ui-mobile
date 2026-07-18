'use client'

import { type MouseEvent } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { SelectCheck } from '@/components/ui/select-check'

interface HabitRowLeadingProps {
  title: string
  emoji: NormalizedHabit['emoji']
  emojiSize: number
  wellSize: number
  wellRadius: number
  selectMode: boolean
  selected: boolean
  hasChildren: boolean
  /** Nesting depth (0 = top-level). An indented leaf reserves the chevron column
   *  so its well aligns with expandable siblings at the same depth. */
  depth: number
  expanded: boolean
  /** When true, the family is past the inline depth cap: the chevron opens it in
   *  focus (drill-in) instead of expanding in place. Rendered in the accent. */
  drillMode: boolean
  onToggleSelection?: () => void
  onExpand: (event: MouseEvent<HTMLButtonElement>) => void
  onDrill: (event: MouseEvent<HTMLButtonElement>) => void
}

/** Leading cluster of a habit row: select checkbox, expand/drill chevron, and emoji well. */
export function HabitRowLeading({
  title,
  emoji,
  emojiSize,
  wellSize,
  wellRadius,
  selectMode,
  selected,
  hasChildren,
  depth,
  expanded,
  drillMode,
  onToggleSelection,
  onExpand,
  onDrill,
}: Readonly<HabitRowLeadingProps>) {
  const t = useTranslations()
  return (
    <>
      {selectMode && (
        <SelectCheck selected={selected} onClick={onToggleSelection} ariaLabel={title} />
      )}

      {!hasChildren && !selectMode && depth > 0 && (
        <span aria-hidden="true" className="shrink-0" style={{ width: 16 }} />
      )}

      {hasChildren && !selectMode && drillMode && (
        <button
          type="button"
          onClick={onDrill}
          aria-label={t('habits.actions.openSubHabits')}
          className="appearance-none border-0 bg-transparent cursor-pointer flex shrink-0 items-center justify-center text-[var(--primary)] transition-[color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:text-[var(--primary-pressed)]"
          style={{ width: 44, height: 44, margin: '-15px -14px' }}
        >
          <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" />
        </button>
      )}

      {hasChildren && !selectMode && !drillMode && (
        <button
          type="button"
          onClick={onExpand}
          aria-label={expanded ? t('common.collapse') : t('common.expand')}
          aria-expanded={expanded}
          className="appearance-none border-0 bg-transparent cursor-pointer flex shrink-0 items-center justify-center text-[var(--fg-3)] transition-[transform,color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:text-[var(--fg-1)]"
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
          background: 'var(--bg-well)',
          fontSize: emoji ? emojiSize : emojiSize - 4,
          lineHeight: 1,
          ...(emoji
            ? {}
            : {
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                color: 'var(--fg-3)',
              }),
        }}
      >
        {emoji ?? [...title.trim().toUpperCase()][0]}
      </span>
    </>
  )
}
