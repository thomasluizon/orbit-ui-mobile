import { useCalendarNavigation } from './calendar/_components/use-calendar-navigation'
import { useCalendarScreenState, type CalendarScreenContentProps } from './calendar/_components/use-calendar-screen-state'

import { CalendarViewRouter, CalendarMonthFooter } from './calendar/_components/calendar-view-router'

import { calendarImportInitialEventId } from '@orbit/shared/utils/calendar-sync'

import { CalendarOptions } from './calendar/_components/calendar-options'

import { CalendarBody } from './calendar/_components/calendar-body'

import { CalendarImportResult } from './calendar/_components/calendar-import-result'

import { useMemo, useState } from "react"

import { View, FlatList, type StyleProp, type ViewStyle } from "react-native"

import { ScreenReaderHeading } from '@/components/ui/screen-reader-heading'

import { useTranslation } from "react-i18next"

import { calendarMonthForDay, calendarImportTitleKey } from "@orbit/shared/utils"

import type { CalendarDayEntry } from "@orbit/shared/types/calendar"

import { useCalendarData } from '@/hooks/use-calendar-data'

import { useProfile } from "@/hooks/use-profile"


import { Sheet } from '@/components/ui/sheet'

import { PillButton } from "@/components/ui/pill-button"

import { CalendarDayDetail } from "./calendar/_components/calendar-day-detail"

import { CalendarDayEvents } from './calendar/_components/calendar-day-events'

import { CalendarImportContent, type CalendarImportActionState } from '@/components/calendar-sync/calendar-import-content'

import { plural } from '@/lib/plural'

function CalendarImportActions({ state, onImport, t }: {
  state: CalendarImportActionState
  onImport: () => void
  t: ReturnType<typeof useTranslation>['t']
}) {
  return <PillButton size="sm" disabled={state.disabled} onClick={onImport}>
    {plural(t('calendar.importButton', { count: state.count }), state.count)}
  </PillButton>
}

const EMPTY_LIST: readonly CalendarDayEntry[] = []

export default function CalendarScreen() {
  const { profile, error: profileError, refetch: refetchProfile } = useProfile()
  const navigation = useCalendarNavigation()
  const { selectedDay, setSelectedDay, view, setView } = navigation
  const currentMonth = useMemo(() => calendarMonthForDay(selectedDay), [selectedDay])
  const monthQuery = useCalendarData(currentMonth)

  return (
    <CalendarScreenContent
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

function calendarListLayout(view: string, guidedLoadError: boolean, clearance: number, container: StyleProp<ViewStyle>) {
  const fills = view === 'week' || guidedLoadError
  let grow = {}
  if (view === 'week') grow = { flex: 1 }
  else if (guidedLoadError) grow = { flexGrow: 1 }
  return { headerStyle: fills ? container : undefined, contentStyle: { paddingBottom: clearance, ...grow } }
}

function CalendarScreenContent(props: Readonly<CalendarScreenContentProps>) {
  const state = useCalendarScreenState(props)
  const [importedCount, setImportedCount] = useState<number | null>(null)
  const finishImport = (count: number) => closeImportSheet(() => { closeImport(); setImportedCount(count) })
  const { profile, profileError, onRetryProfile, selectedDay, view, router, t, openImport, tokens, listRef, displayTime, styles, clearance, isDayDetailOpen, sheetRef, openDayDisclosure, setIsEventsOpen, openHabit, disclosedWeekDay, isEventsOpen, showImportSheet, importSheetRef, closeImport, reviewRequested, importActionState, commitCalendarImport, importRequested, params, initialImportEventId, importActionRef, setImportActionState, closeImportSheet, setIsImportOpen, showEventSource, calendarEventsState, refetchCalendarEvents, openOrbitPro, rangeLoadingLabel, closeDayDetail, activeError, activeRefresh, formattedSelectedDate, selectedCalendarEvents, completedCount, selectedDayLoggable, pendingEntryStates, changeSelectedEntry, filteredEntries, goToSelectedDay, openGoogleCalendar, calendarHeader } = state

  const listLayout = calendarListLayout(view, Boolean(profile ? activeError : profileError), clearance, styles.container)

  return (
    <View style={[styles.safeArea, { backgroundColor: tokens.bg }]}>
      <ScreenReaderHeading title={t('nav.calendar')} />
      <CalendarOptions tokens={tokens} onGoogleCalendar={profile ? openGoogleCalendar : undefined} />

      <FlatList
        ref={listRef}
        style={styles.container}
        data={EMPTY_LIST}
        keyExtractor={(_item, index) => String(index)}
        renderItem={null}
        ListHeaderComponent={<>
          {calendarHeader}
          <CalendarBody profileReady={Boolean(profile)} profileError={profileError} onRetryProfile={onRetryProfile} error={activeError} onRetry={() => void activeRefresh()} tokens={tokens}>
            <CalendarViewRouter state={state} />
          </CalendarBody>
        </>}
        ListHeaderComponentStyle={listLayout.headerStyle}
        ListFooterComponent={view === 'month' && !(profile ? activeError : profileError) ? <CalendarMonthFooter state={state} /> : undefined}
        contentContainerStyle={listLayout.contentStyle}
        scrollEnabled={view !== 'week'}
        showsVerticalScrollIndicator={false}
      />

      {isDayDetailOpen && view === 'week' && selectedDay ? (<Sheet
        ref={sheetRef}
        open
        onClose={closeDayDetail}
        title={formattedSelectedDate}
        key={selectedDay}
      >
        <View style={styles.sheetContent}>
          <CalendarDayDetail
            loadingLabel={rangeLoadingLabel}
            selectedDate={selectedDay}
            title={formattedSelectedDate}
            showTitle={false}
            filteredEntries={filteredEntries}
            calendarEvents={selectedCalendarEvents}
            showEventSource={showEventSource}
            calendarEventsState={calendarEventsState}
            onRetryCalendarEvents={() => void refetchCalendarEvents()}
            onReconnectCalendarEvents={() => openImport(null)}
            onOpenCalendarImport={openImport}
            onOpenEvents={() => openDayDisclosure(() => setIsEventsOpen(true))}
            onOpenHabit={(id) => openDayDisclosure(() => openHabit(id, selectedDay))}
            onViewPro={openOrbitPro}
            completedCount={completedCount}
            loggable={selectedDayLoggable}
            pendingEntryStates={pendingEntryStates}
            onEntryChange={changeSelectedEntry}
            onGoToDay={goToSelectedDay}
            displayTime={displayTime}
            t={t}
            tokens={tokens}
          />
        </View>
      </Sheet>) : null}
      {disclosedWeekDay ? <CalendarDayEvents key={disclosedWeekDay} sheetOnly open={isEventsOpen} onClose={() => setIsEventsOpen(false)} calendarEvents={selectedCalendarEvents} showEventSource={showEventSource} onOpenImport={openImport} t={t} displayTime={displayTime} /> : null}
      {showImportSheet ? (<Sheet
        ref={importSheetRef}
        onClose={closeImport}
        title={t(calendarImportTitleKey(reviewRequested))}
        actions={importActionState ? <CalendarImportActions state={importActionState} onImport={commitCalendarImport} t={t} /> : undefined}
      >
        <CalendarImportContent
          reviewMode={reviewRequested}
          initialEventId={calendarImportInitialEventId(importRequested, params.event ?? null, initialImportEventId)}
          actionRef={importActionRef}
          onActionStateChange={setImportActionState}
          onClose={(afterClose) => closeImportSheet(afterClose, afterClose)}
          onGoToHabits={() => closeImportSheet(() => {
            setIsImportOpen(false)
            router.push('/(tabs)')
          })}
          onImported={finishImport}
        />
      </Sheet>) : null}
      <CalendarImportResult count={importedCount} onClose={() => setImportedCount(null)} />
    </View>
  )
}
