'use client'

import { useId, useRef, useState } from 'react'
import { MoreVertical, ChevronLeft, ChevronRight, Search } from '@/components/ui/icons'
import { Menu } from '@/components/ui/menu'
import { PillButton } from '@/components/ui/pill-button'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'
import { useShellHeaderSlot } from '@/components/shell/destination-shell'

const DATE_ICON_BUTTON_CLASS_NAME =
  'touch-target grid min-h-[48px] w-[48px] shrink-0 cursor-pointer place-items-center rounded-full text-[var(--fg-2)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:enabled:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2'

export interface TodayDateControlProps {
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
  onSearch: () => void
}

function TodayHeaderActions(props: Readonly<TodayDateControlProps>) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const menuAnchorRef = useRef<HTMLButtonElement>(null)
  const wide = useIsWideDesktop()
  return <div data-today-header-actions="" className="flex min-h-[48px] items-center gap-[4px] px-[16px]">
    {!props.isTodaySelected ? <PillButton variant="ghost" size="sm" minimumHeight={48}
      accessibleName={props.goToTodayLabel} onClick={props.onGoToToday}>{props.todayLabel}</PillButton> : null}
    <div className="flex-1" />
    <button type="button" aria-label={props.searchLabel} onClick={props.onSearch}
      className={`${DATE_ICON_BUTTON_CLASS_NAME} lg:hidden`}><Search size={20} aria-hidden="true" /></button>
    <button ref={menuAnchorRef} type="button" aria-label={props.moreLabel} aria-expanded={menuOpen}
      aria-controls={menuId} className={DATE_ICON_BUTTON_CLASS_NAME} onClick={() => setMenuOpen((open) => !open)}>
      <MoreVertical size={20} strokeWidth={1.8} aria-hidden="true" />
    </button>
    {!wide ? <NotificationBell /> : null}
    <Menu id={menuId} open={menuOpen} anchorRef={menuAnchorRef} title={props.moreLabel} shortTitle={props.menuHeading}
      items={[
        { id: 'select', label: props.selectLabel, icon: 'checkbox' },
        { id: 'collapse', label: props.collapseLabel, icon: props.allCollapsed ? 'chevrons-down' : 'chevrons-up' },
        { id: 'refresh', label: props.refreshLabel, icon: 'refresh', disabled: props.isFetching },
        { id: 'completed', label: props.completedLabel, icon: props.showCompleted ? 'eye-off' : 'eye' },
      ]}
      onClose={() => setMenuOpen(false)} onSelect={(id) => {
        if (id === 'select') props.onToggleSelect()
        else if (id === 'collapse') props.onToggleCollapse()
        else if (id === 'refresh') props.onRefresh()
        else if (id === 'completed') props.onToggleCompleted()
      }} />
  </div>
}

export function TodayDateControl(props: Readonly<TodayDateControlProps>) {
  const header = () => <TodayHeaderActions {...props} />
  const hosted = useShellHeaderSlot(header, `${props.dayName}:${props.isTodaySelected}`)
  return <>
    {!hosted ? header() : null}
    <div data-today-date-row="" className="@container flex min-h-[56px] items-center gap-[12px] px-[16px] py-[4px]">
      <button type="button" aria-label={props.previousLabel} className={DATE_ICON_BUTTON_CLASS_NAME} onClick={props.onGoToPreviousDay}>
        <ChevronLeft size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <div className="shrink-0 grow-0 text-start" title={`${props.dayName}, ${props.numericDate}`}>
        <p className="m-0 whitespace-nowrap font-display text-[1.375rem] font-medium tracking-[-0.02em] text-[var(--fg-1)]">
          {props.shortDayName ? <>
            <span className="@[15rem]:contents hidden">{props.dayName}</span>
            <span className="@[15rem]:hidden contents">{props.shortDayName}</span>
          </> : props.dayName}
        </p>
        <p className="m-0 whitespace-nowrap font-mono text-xs tracking-[0.02em] tabular-nums text-[var(--fg-3)]">{props.numericDate}</p>
      </div>
      <button type="button" aria-label={props.nextLabel} disabled={props.nextDisabled}
        className={`${DATE_ICON_BUTTON_CLASS_NAME} disabled:cursor-default disabled:opacity-50`} onClick={props.onGoToNextDay}>
        <ChevronRight size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  </>
}
