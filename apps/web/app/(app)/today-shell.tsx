'use client'

import { useId, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { HABIT_FREQUENCY_FILTER_OPTIONS, toggleHabitFrequencyFilter } from '@orbit/shared/utils/habit-frequency-filter'
import { useUIStore } from '@/stores/ui-store'
import { MoreVertical, ChevronLeft, ChevronRight, Search } from '@/components/ui/icons'
import { Menu } from '@/components/ui/menu'
import { PillButton } from '@/components/ui/pill-button'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { DestinationHeaderRow } from '@/components/navigation/root-notification-header'
import { ShellHeader } from '@/components/shell/shell-header'

const DATE_ICON_BUTTON_CLASS_NAME =
  'touch-target grid min-h-[48px] w-[48px] shrink-0 cursor-pointer place-items-center rounded-full text-[var(--fg-2)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:enabled:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2'

export interface TodayDateControlProps {
  showDate?: boolean
  beforeDate?: ReactNode
  menuHeading?: string
  shortDayName?: string
  headerActive?: boolean
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
  searchOpen?: boolean
  searchControlsId?: string
  onSearch: () => void
}

function TodayHeaderActions(props: Readonly<TodayDateControlProps>) {
  const t = useTranslations()
  const frequencyUnit = useUIStore((state) => state.activeFilters.frequencyUnit)
  const setFilters = useUIStore((state) => state.setFilters)
  const [menuOpen, setMenuOpen] = useState(false)
  const [frequencyMenu, setFrequencyMenu] = useState(false)
  const menuId = useId()
  const menuAnchorRef = useRef<HTMLButtonElement>(null)
  return <DestinationHeaderRow data-today-header-actions="" gap={4} className="flex-wrap">
    {props.showDate !== false && !props.isTodaySelected ? <PillButton variant="ghost" size="sm" minimumHeight={48}
      accessibleName={props.goToTodayLabel} onClick={props.onGoToToday}>{props.todayLabel}</PillButton> : null}
    <div className="flex-1" />
    <div className="flex shrink-0 items-center gap-[4px]">
      <button type="button" aria-label={props.searchLabel} aria-expanded={props.searchOpen} aria-controls={props.searchControlsId} onClick={props.onSearch}
        className={`${DATE_ICON_BUTTON_CLASS_NAME} lg:hidden`}><Search size={20} aria-hidden="true" /></button>
      <button ref={menuAnchorRef} type="button" aria-label={props.moreLabel} aria-expanded={menuOpen}
        aria-controls={menuId} className={DATE_ICON_BUTTON_CLASS_NAME} onClick={() => { setFrequencyMenu(false); setMenuOpen((open) => !open) }}>
        <MoreVertical size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <div className="lg:hidden"><NotificationBell /></div>
    </div>
    <Menu key={frequencyMenu ? 'frequency' : 'options'} id={menuId} open={menuOpen} anchorRef={menuAnchorRef}
      title={frequencyMenu ? t('habits.frequencyFilter') : props.moreLabel}
      shortTitle={frequencyMenu ? t('common.options') : props.menuHeading}
      items={frequencyMenu ? HABIT_FREQUENCY_FILTER_OPTIONS.map((option) => ({
        id: option.id, label: t(option.labelKey), checked: frequencyUnit === option.value,
      })) : [
        { id: 'select', label: props.selectLabel, icon: 'checkbox' },
        { id: 'collapse', label: props.collapseLabel, icon: props.allCollapsed ? 'chevrons-down' : 'chevrons-up' },
        { id: 'refresh', label: props.refreshLabel, icon: 'refresh', disabled: props.isFetching },
        { id: 'completed', label: props.completedLabel, icon: props.showCompleted ? 'eye-off' : 'eye' },
        { id: 'frequency', label: t('habits.frequencyFilter'), icon: 'adjustments-horizontal' },
      ]}
      onClose={() => setMenuOpen(false)} onSelect={(id) => {
        if (frequencyMenu) setFilters({ frequencyUnit: toggleHabitFrequencyFilter(frequencyUnit, id) })
        else if (id === 'frequency') { setFrequencyMenu(true); setMenuOpen(true) }
        else if (id === 'select') props.onToggleSelect()
        else if (id === 'collapse') props.onToggleCollapse()
        else if (id === 'refresh') props.onRefresh()
        else if (id === 'completed') props.onToggleCompleted()
      }} />
  </DestinationHeaderRow>
}

export function TodayDateControl(props: Readonly<TodayDateControlProps>) {
  return <div>
    <ShellHeader><TodayHeaderActions {...props} /></ShellHeader>
    <div className="flex min-w-0 flex-col gap-6">
      {props.beforeDate}
      {props.showDate !== false ? <div data-today-date-row="" className="@container flex min-h-[56px] items-center gap-[12px] px-[16px] py-[4px]">
        <button type="button" aria-label={props.previousLabel} className={DATE_ICON_BUTTON_CLASS_NAME} onClick={props.onGoToPreviousDay}>
          <ChevronLeft size={20} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 text-center" title={`${props.dayName}, ${props.numericDate}`}>
          <p className="m-0 whitespace-nowrap font-display text-[1.375rem] font-medium tracking-[-0.02em] text-[var(--fg-1)]">
            {props.shortDayName ? <>
              <span className="@[15rem]:contents hidden">{props.dayName}</span>
              <span className="@[15rem]:hidden contents">{props.shortDayName}</span>
            </> : props.dayName}
          </p>
          <p className="m-0 font-mono text-xs tracking-[0.02em] tabular-nums text-[var(--fg-3)]">{props.numericDate}</p>
        </div>
        <button type="button" aria-label={props.nextLabel} disabled={props.nextDisabled}
          className={`${DATE_ICON_BUTTON_CLASS_NAME} disabled:cursor-default disabled:opacity-50`} onClick={props.onGoToNextDay}>
          <ChevronRight size={20} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div> : null}
    </div>
  </div>
}
