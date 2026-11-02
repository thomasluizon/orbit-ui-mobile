import { createStyles } from './calendar/_components/calendar-screen-styles'

import { useCalendarScreenState, type CalendarScreenContentProps } from './calendar/_components/use-calendar-screen-state'

import { CalendarViewRouter, CalendarMonthFooter } from './calendar/_components/calendar-view-router'

import { IconButton } from '@/components/ui/icon-button'

import { RefreshCw } from '@/components/ui/icons'

import { calendarImportInitialEventId } from '@orbit/shared/utils/calendar-sync'

import { type CalendarView } from '@orbit/shared/utils/calendar-navigation'

import { CalendarOptions } from './calendar/_components/calendar-options'

import { useState, useMemo, useEffect, type ReactNode } from "react"

import { View, Text, FlatList } from "react-native"

import { ScreenReaderHeading } from '@/components/ui/screen-reader-heading'

import { useTranslation } from "react-i18next"

import { useLocalSearchParams, useRouter } from "expo-router"

import { formatAPIDate, resolveHabitDetailRouteDate, calendarMonthForDay, calendarImportTitleKey } from "@orbit/shared/utils"

import type { CalendarDayEntry } from "@orbit/shared/types/calendar"

import { useCalendarData } from "@/hooks/use-habits"

import { useProfile } from "@/hooks/use-profile"

import { useAccountBoundRouteRequest, useAccountScopedState } from '@/hooks/use-session-reset'

import { createTokensV2 } from "@/lib/theme"

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
  const { setParams } = useRouter()
  const { profile, error: profileError, refetch: refetchProfile } = useProfile()
  const params = useLocalSearchParams<{ date?: string }>()
  const routeDate = resolveHabitDetailRouteDate(params.date)
  const acceptRouteDate = useAccountBoundRouteRequest(routeDate ?? '')
  const [selectedDay, setSelectedDay] = useAccountScopedState(() => acceptRouteDate && routeDate ? routeDate : formatAPIDate(new Date()))
  const [view, setView] = useState<CalendarView>('month')
  const [observedRouteDate, setObservedRouteDate] = useState(routeDate)
  if (observedRouteDate !== routeDate) {
    setObservedRouteDate(routeDate)
    if (acceptRouteDate && routeDate) {
      setSelectedDay(routeDate)
      setView('month')
    }
  }
  useEffect(() => {
    if (params.date !== undefined) setParams({ date: undefined })
  }, [params.date, setParams])
  const currentMonth = useMemo(() => calendarMonthForDay(selectedDay), [selectedDay])
  const monthQuery = useCalendarData(currentMonth)

  return (
    <CalendarScreenContent
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

function CalendarLoadError({ onRetry, tokens }: Readonly<{ onRetry: () => void; tokens: ReturnType<typeof createTokensV2> }>) {
  const { t } = useTranslation()
  const styles = useMemo(() => createStyles(), [])
  return <View style={styles.errorWrap}>
    <View style={[styles.errorCard, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
      <Text style={[styles.errorText, { color: tokens.fg2 }]}>{t('calendar.loadError')}</Text>
      <IconButton label={t('common.retry')} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton>
    </View>
  </View>
}

function CalendarBody({ profileReady, profileError, onRetryProfile, error, onRetry, tokens, children }: Readonly<{
  profileReady: boolean
  profileError: Error | null
  onRetryProfile: () => void
  error: string | null
  onRetry: () => void
  tokens: ReturnType<typeof createTokensV2>
  children: ReactNode
}>) {
  if (!profileReady && profileError) return <CalendarLoadError onRetry={onRetryProfile} tokens={tokens} />
  if (profileReady && error) return <CalendarLoadError onRetry={onRetry} tokens={tokens} />
  return children
}

function CalendarScreenContent(props: Readonly<CalendarScreenContentProps>) {
  const state = useCalendarScreenState(props)
  const { profile, profileError, onRetryProfile, selectedDay, view, router, t, openImport, tokens, listRef, displayTime, styles, clearance, isDayDetailOpen, sheetRef, openDayDisclosure, setIsEventsOpen, openHabit, disclosedWeekDay, isEventsOpen, showImportSheet, importSheetRef, closeImport, reviewRequested, importActionState, commitCalendarImport, importRequested, params, initialImportEventId, importActionRef, setImportActionState, closeImportSheet, setIsImportOpen, showEventSource, calendarEventsState, refetchCalendarEvents, openOrbitPro, rangeLoadingLabel, closeDayDetail, activeError, activeRefresh, formattedSelectedDate, selectedCalendarEvents, completedCount, selectedDayLoggable, pendingEntryStates, changeSelectedEntry, filteredEntries, goToSelectedDay, openGoogleCalendar, calendarHeader } = state

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
        ListHeaderComponentStyle={view === 'week' ? styles.container : undefined}
        ListFooterComponent={view === 'month' ? <CalendarMonthFooter state={state} /> : undefined}
        contentContainerStyle={{ paddingBottom: clearance, ...(view === 'week' ? { flex: 1 } : {}) }}
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
        />
      </Sheet>) : null}
    </View>
  )
}
