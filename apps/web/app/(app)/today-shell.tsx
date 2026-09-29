'use client'

import { useId, useRef, useState } from 'react'
import { AdjustmentsHorizontal, ChevronLeft, ChevronRight, Search } from '@/components/ui/icons'
import { Menu } from '@/components/ui/menu'
import { PillButton } from '@/components/ui/pill-button'

const DATE_ICON_BUTTON_CLASS_NAME =
  'icon-btn touch-target shrink-0 hover:bg-[var(--bg-hover)] [transition-duration:var(--dur-hover-control),var(--dur-hover-control),var(--dur-fast)]'

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
  goToTodayLabel: string
  nextLabel: string
  moreLabel: string
  selectLabel: string
  collapseLabel: string
  allCollapsed: boolean
  refreshLabel: string
  completedLabel: string
  showCompleted: boolean
  isFetching: boolean
  onToggleSelect: () => void
  onToggleCollapse: () => void
  onRefresh: () => void
  onToggleCompleted: () => void
  searchLabel: string
  onSearch: () => void
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
  goToTodayLabel,
  nextLabel,
  moreLabel,
  selectLabel,
  collapseLabel,
  allCollapsed,
  refreshLabel,
  completedLabel,
  showCompleted,
  isFetching,
  onToggleSelect,
  onToggleCollapse,
  onRefresh,
  onToggleCompleted,
  searchLabel,
  onSearch,
}: Readonly<TodayDateControlProps>) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const menuAnchorRef = useRef<HTMLButtonElement>(null)
  const items = [
    { id: 'select', label: selectLabel, icon: 'checkbox' },
    { id: 'collapse', label: collapseLabel, icon: allCollapsed ? 'chevrons-down' : 'chevrons-up' },
    { id: 'refresh', label: refreshLabel, icon: 'refresh', disabled: isFetching },
    { id: 'completed', label: completedLabel, icon: showCompleted ? 'eye-off' : 'eye' },
  ]

  return (
    <div className="flex min-h-[53px] flex-wrap items-center justify-end gap-1 px-2">
      <button
        type="button"
        aria-label={previousLabel}
        className={DATE_ICON_BUTTON_CLASS_NAME}
        onClick={onGoToPreviousDay}
      >
        <ChevronLeft size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <div className="min-w-0 max-w-full flex-[1_0_auto] text-start" title={`${dayName}, ${numericDate}`}>
        <p className="m-0 [overflow-wrap:anywhere] font-display text-[22px] font-medium tracking-[-0.02em] text-[var(--fg-1)]">{dayName}</p>
        <p className="m-0 [overflow-wrap:anywhere] font-mono text-xs tracking-[0.02em] tabular-nums text-[var(--fg-3)]">{numericDate}</p>
      </div>
      <button
        type="button"
        aria-label={nextLabel}
        disabled={nextDisabled}
        className={`${DATE_ICON_BUTTON_CLASS_NAME} disabled:cursor-default disabled:opacity-50`}
        onClick={onGoToNextDay}
      >
        <ChevronRight size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
      {!isTodaySelected ? (
        <PillButton variant="ghost" size="sm" accessibleName={goToTodayLabel} onClick={onGoToToday}>
          {todayLabel}
        </PillButton>
      ) : null}
      <button
        ref={menuAnchorRef}
        type="button"
        aria-label={moreLabel}
        aria-expanded={menuOpen}
        aria-controls={menuId}
        className={DATE_ICON_BUTTON_CLASS_NAME}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <AdjustmentsHorizontal size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <button type="button" aria-label={searchLabel} onClick={onSearch}
        className={`${DATE_ICON_BUTTON_CLASS_NAME} lg:hidden`}>
        <Search size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <Menu
        id={menuId}
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
