"use client"

import { useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { MoreVertical } from '@/components/ui/icons'
import { Menu } from '@/components/ui/menu'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { DestinationHeaderRow } from '@/components/navigation/root-notification-header'
import { ShellHeader } from '@/components/shell/shell-header'
import { useUIStore } from '@/stores/ui-store'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'
import { CalendarLegend } from './calendar-shell'

function CalendarOptionsContent({ onGoogleCalendar }: Readonly<{ onGoogleCalendar?: () => void }>) {
  const menuId = useId()
  const t = useTranslations()
  const wide = useIsWideDesktop()
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const { sheetRef } = useSheetHost()
  const checked = useUIStore((state) => state.calendarShowRecurring)
  const setChecked = useUIStore((state) => state.setCalendarShowRecurring)
  return <>
    <DestinationHeaderRow data-testid="calendar-shell-header">
      <button ref={anchorRef} type="button" className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full border-0 bg-transparent text-[var(--fg-2)] cursor-pointer transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg-1)]" aria-label={t('calendar.options')} aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuId} onClick={() => setMenuOpen(true)}><MoreVertical size={24} strokeWidth={2} aria-hidden="true" /></button>
      {!wide ? <NotificationBell /> : null}
    </DestinationHeaderRow>
    <Menu id={menuId} open={menuOpen} anchorRef={anchorRef} title={t('calendar.options')} onClose={() => setMenuOpen(false)}
      items={[{ id: 'recurring', label: t('calendar.showRecurring'), checked }, { id: 'google', label: t('calendar.googleCalendar'), disabled: !onGoogleCalendar }, { id: 'legend', label: t('calendar.legendTitle') }]}
      onSelect={(id) => { if (id === 'recurring') setChecked(!checked); else if (id === 'google') onGoogleCalendar?.(); else setLegendOpen(true) }} />
    {legendOpen ? <Sheet ref={sheetRef} open title={t('calendar.legendTitle')} onClose={() => setLegendOpen(false)}>
      <CalendarLegend loggableLabel={t('calendar.legend.loggable')} fullLabel={t('calendar.legend.full')} partialLabel={t('calendar.legend.partial')} noneLabel={t('calendar.legend.none')} />
    </Sheet> : null}
  </>
}

export function CalendarOptions({ onGoogleCalendar }: Readonly<{ onGoogleCalendar?: () => void }>) {
  return <ShellHeader><CalendarOptionsContent onGoogleCalendar={onGoogleCalendar} /></ShellHeader>
}
