'use client'

import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, MoreVertical } from '@/components/ui/icons'
import { Menu } from '@/components/ui/menu'

export interface TodayDateControlProps {
  dayName: string
  numericDate: string
  isTodaySelected: boolean
  nextDisabled: boolean
  onGoToPreviousDay: () => void
  onGoToToday: () => void
  onGoToNextDay: () => void
  previousLabel: string
  todayLabel: string
  nextLabel: string
  moreLabel: string
  selectLabel: string
  collapseLabel: string
  refreshLabel: string
  completedLabel: string
  isFetching: boolean
  onToggleSelect: () => void
  onToggleCollapse: () => void
  onRefresh: () => void
  onToggleCompleted: () => void
}

export function TodayDateControl({
  dayName,
  numericDate,
  isTodaySelected,
  nextDisabled,
  onGoToPreviousDay,
  onGoToToday,
  onGoToNextDay,
  previousLabel,
  todayLabel,
  nextLabel,
  moreLabel,
  selectLabel,
  collapseLabel,
  refreshLabel,
  completedLabel,
  isFetching,
  onToggleSelect,
  onToggleCollapse,
  onRefresh,
  onToggleCompleted,
}: Readonly<TodayDateControlProps>) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuAnchorRef = useRef<HTMLButtonElement>(null)
  const items = [
    { id: 'select', label: selectLabel },
    { id: 'collapse', label: collapseLabel },
    { id: 'refresh', label: refreshLabel, disabled: isFetching },
    { id: 'completed', label: completedLabel },
  ]

  return (
    <div className="flex min-h-[53px] items-center gap-2 px-4">
      <button
        type="button"
        aria-label={previousLabel}
        className="icon-btn touch-target shrink-0"
        onClick={onGoToPreviousDay}
      >
        <ChevronLeft size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1 text-center">
        <p className="m-0 truncate text-sm font-medium text-[var(--fg-1)]">{dayName}</p>
        <p className="m-0 truncate font-mono text-xs text-[var(--fg-3)]">{numericDate}</p>
      </div>
      {!isTodaySelected ? (
        <button
          type="button"
          className="min-h-11 appearance-none border-0 bg-transparent px-2 text-sm font-medium text-[var(--fg-1)] underline underline-offset-4"
          onClick={onGoToToday}
        >
          {todayLabel}
        </button>
      ) : null}
      <button
        type="button"
        aria-label={nextLabel}
        disabled={nextDisabled}
        className="icon-btn touch-target shrink-0 disabled:cursor-default disabled:opacity-50"
        onClick={onGoToNextDay}
      >
        <ChevronRight size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <button
        ref={menuAnchorRef}
        type="button"
        aria-label={moreLabel}
        aria-expanded={menuOpen}
        className="icon-btn touch-target shrink-0"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <MoreVertical size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <Menu
        open={menuOpen}
        anchorRef={menuAnchorRef}
        title={moreLabel}
        items={items}
        onClose={() => setMenuOpen(false)}
        onSelect={(id) => {
          if (id === 'select') onToggleSelect()
          else if (id === 'collapse') onToggleCollapse()
          else if (id === 'refresh') onRefresh()
          else if (id === 'completed') onToggleCompleted()
        }}
      />
    </div>
  )
}
