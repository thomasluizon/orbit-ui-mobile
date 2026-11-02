'use client'

import { useCalendarScreenState, type CalendarPageContentProps } from './_components/use-calendar-screen-state'
import { CalendarViewRouter } from './_components/calendar-view-router'
import { calendarImportInitialEventId } from '@orbit/shared/utils/calendar-sync'
import { useMemo, Suspense, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { calendarMonthForDay, calendarImportTitleKey } from '@orbit/shared/utils'
import { useCalendarData } from '@/hooks/use-calendar-data'
import { useProfile } from '@/hooks/use-profile'
import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'
import { CalendarDayEvents } from '@/components/calendar/calendar-day-events'
import { CalendarImportContent, type CalendarImportActionState } from '@/components/calendar-sync/calendar-import-content'
import { CalendarLoadError } from '@/components/calendar/calendar-load-error'
import { Sheet } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import { plural } from '@/lib/plural'
import { CalendarOptions } from './_components/calendar-options'
import { useCalendarNavigation } from '@/hooks/use-calendar-navigation'

function CalendarImportActions({ state, onImport, t }: {
  state: CalendarImportActionState
  onImport: () => void
  t: ReturnType<typeof useTranslations>
}) {
  return <PillButton size="sm" disabled={state.disabled} onClick={onImport}>
    {plural(t('calendar.importButton', { count: state.count }), state.count)}
  </PillButton>
}

export default function CalendarPage() {
  return <Suspense fallback={null}><CalendarPageState /></Suspense>
}

function CalendarPageState() {
  const { profile, error: profileError, refetch: refetchProfile } = useProfile()
  const navigation = useCalendarNavigation()
  const { selectedDay, setSelectedDay, view, setView } = navigation
  const currentMonth = useMemo(() => calendarMonthForDay(selectedDay), [selectedDay])
  const monthQuery = useCalendarData(currentMonth)

  return (
    <CalendarPageContent
      navigation={navigation}
      profile={profile}
      profileError={profileError}
      onRetryProfile={() => void refetchProfile()}
      currentMonth={currentMonth}
      selectedDay={selectedDay}
      setSelectedDay={setSelectedDay}
      monthQuery={{ ...monthQuery, isLoading: !profile || monthQuery.isLoading }}
      view={view}
      setView={setView}
    />
  )
}

function CalendarBody({ profileReady, profileError, onRetryProfile, error, onRetry, children }: Readonly<{
  profileReady: boolean
  profileError: Error | null
  onRetryProfile: () => void
  error: string | null
  onRetry: () => void
  children: ReactNode
}>) {
  if (!profileReady && profileError) return <CalendarLoadError onRetry={onRetryProfile} />
  if (profileReady && error) return <div style={{ padding: "var(--orbit-space-0) var(--orbit-space-16) var(--orbit-space-16)" }}><CalendarLoadError onRetry={onRetry} /></div>
  return children
}

function CalendarPageContent(props: Readonly<CalendarPageContentProps>) {
  const state = useCalendarScreenState(props)
  const { profile, profileError, onRetryProfile, selectedDay, view, setIsDayDetailOpen, router, todayKey, t, openGoogleCalendar, openImport, isDayDetailOpen, sheetRef, openDayDisclosure, setIsEventsOpen, openHabit, disclosedWeekDay, isEventsOpen, showImportSheet, importSheetRef, closeImport, reviewRequested, importActionState, commitCalendarImport, importRequested, searchParams, initialImportEventId, importActionRef, setImportActionState, closeImportSheet, setIsImportOpen, showRecurring, showEventSource, calendarEventsState, refetchCalendarEvents, openOrbitPro, rangeLoadingLabel, activeError, activeRefresh, selectedCalendarEvents, selectedDayLoggable, pendingEntryStates, changeSelectedEntry, selectedEntries, dayDetailTitle, pageLayout } = state

  return (
    <div {...pageLayout.viewportProps} data-calendar-page="" className={pageLayout.pageClass}>
      <h1 className="sr-only" tabIndex={-1}>{t('nav.calendar')}</h1>
      <div className={pageLayout.contentClass}>
        <CalendarOptions onGoogleCalendar={profile ? openGoogleCalendar : undefined} />
        {pageLayout.header}

        <CalendarBody profileReady={Boolean(profile)} profileError={profileError} onRetryProfile={onRetryProfile} error={activeError} onRetry={() => void activeRefresh()}>
          <CalendarViewRouter state={state} />
        </CalendarBody>
      </div>

      {isDayDetailOpen && view === 'week' ? (<Sheet
        ref={sheetRef}
        open
        onClose={() => (setIsDayDetailOpen)(false)}
        title={dayDetailTitle}
      >
        <CalendarDayDetail
          loadingLabel={rangeLoadingLabel}
          dateStr={selectedDay}
          today={todayKey}
          showTitle={false}
          entries={selectedEntries}
          calendarEvents={selectedCalendarEvents}
          showEventSource={showEventSource}
          calendarEventsState={calendarEventsState}
          onRetryCalendarEvents={() => void refetchCalendarEvents()}
          onReconnectCalendarEvents={() => openImport(null)}
          onOpenCalendarImport={openImport}
          onOpenEvents={() => openDayDisclosure(() => setIsEventsOpen(true))}
          onOpenHabit={(id) => openDayDisclosure(() => openHabit(id, selectedDay))}
          onViewPro={openOrbitPro}
          loggable={selectedDayLoggable}
          showRecurring={showRecurring}
          pendingEntryStates={pendingEntryStates}
          onEntryChange={changeSelectedEntry}
        />
      </Sheet>) : null}
      {disclosedWeekDay ? <CalendarDayEvents key={disclosedWeekDay} sheetOnly open={isEventsOpen} onClose={() => setIsEventsOpen(false)} calendarEvents={selectedCalendarEvents} showEventSource={showEventSource} onOpenImport={openImport} /> : null}
      {showImportSheet ? <Sheet
        ref={importSheetRef}
        open
        onClose={closeImport}
        title={t(calendarImportTitleKey(reviewRequested))}
        actions={importActionState ? <CalendarImportActions state={importActionState} onImport={commitCalendarImport} t={t} /> : undefined}
      >
        <CalendarImportContent
          reviewMode={reviewRequested}
          initialEventId={calendarImportInitialEventId(importRequested, searchParams.get('event'), initialImportEventId)}
          actionRef={importActionRef}
          onActionStateChange={setImportActionState}
          onClose={() => closeImportSheet()}
          onGoToHabits={() => closeImportSheet(() => {
            setIsImportOpen(false)
            router.push('/')
          })}
        />
      </Sheet> : null}
    </div>
  )
}
