'use client'

import { useState, useEffect, useMemo, useImperativeHandle, type Ref } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check,
  Link as LinkIcon,
  AlertTriangle,
} from '@/components/ui/icons'
import { useQueryClient } from '@tanstack/react-query'
import { PillButton } from '@/components/ui/pill-button'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import { useProfile, useHasProAccess } from '@/hooks/use-profile'
import { useBulkCreateHabits } from '@/hooks/use-habits'
import { useOffline } from '@/hooks/use-offline'
import { OfflineRefusal } from '@/components/ui/offline-refusal'
import { useAccountGeneration, useAccountScopedState } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import {
  useCalendarAutoSyncState,
  useCalendarSyncSuggestions,
  useDismissCalendarSuggestion,
} from '@/hooks/use-calendar-auto-sync'
import { useCalendarEvents } from '@/hooks/use-calendar-events'
import {
  resolveCalendarSyncStep,
  resolveDisplayedErrorMessage,
  resolveSyncedSelection,
  type WizardStage,
} from '@/lib/calendar-sync-state'
import { CalendarPickerSection } from './calendar-picker-section'
import { CalendarSyncEventRow } from './calendar-sync-event-row'
import { SelectAllToggle } from './select-all-toggle'
import { connectGoogle } from './connect-google'
import type { CalendarSyncEvent, CalendarSyncSuggestion } from '@orbit/shared'
import { calendarKeys } from '@orbit/shared/query'
import {
  buildCalendarAutoSyncImportRequest,
  buildCalendarSyncImportRequest,
  getFriendlyErrorMessage,
  isCalendarSyncEventImportable,
  isCalendarSyncConnectionActive,
  resolveCalendarImportConnectionStep,
  selectInitialCalendarImportEvent,
} from '@orbit/shared/utils'
import { toast } from 'sonner'

interface ImportResult {
  imported: number
  habits: { id: string; title: string }[]
}

const EVENTS_PAGE_SIZE = 20

export interface CalendarImportActionHandle {
  importSelected: () => void
}

export interface CalendarImportActionState {
  count: number
  disabled: boolean
}

type CalendarEvent = CalendarSyncEvent

export function CalendarImportContent({ reviewMode, initialEventId, onClose, onGoToHabits, actionRef, onActionStateChange }: Readonly<{ reviewMode: boolean; initialEventId: string | null; onClose: () => void; onGoToHabits: () => void; actionRef: Ref<CalendarImportActionHandle>; onActionStateChange: (state: CalendarImportActionState | null) => void }>) {
  const t = useTranslations()
  const router = useRouter()
  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()
  const bulkCreateHabits = useBulkCreateHabits()
  const queryClient = useQueryClient()
  const { isOnline } = useOffline()
  const accountGeneration = useAccountGeneration()

  const isReviewMode = reviewMode
  const isProUser = Boolean(profile) && hasProAccess
  const weekStartDay = profile?.weekStartDay ?? 1

  /**
   * `events`, `selectedIds`, `visibleCount` and the latch below re-derive from the query cache
   * through the `eventsKey` sync, so emptying that cache empties them. The four that follow do
   * not: they are the wizard's own answer, and `importResult` names the habits the PREVIOUS
   * account just created.
   */
  const [wizardStage, setWizardStage] = useAccountScopedState<WizardStage>('browse')
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [errorMessage, setErrorMessage] = useAccountScopedState('')
  const [importResult, setImportResult] = useAccountScopedState<ImportResult | null>(null)
  const [isConnecting, setIsConnecting] = useAccountScopedState(false)
  const [previousEventsKey, setPreviousEventsKey] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(EVENTS_PAGE_SIZE)

  const eventsQuery = useCalendarEvents({
    enabled: isProUser && !isReviewMode,
    timeZone: profile?.timeZone ?? null,
  })
  const autoSyncStateQuery = useCalendarAutoSyncState({ enabled: isProUser })
  const googleConnected = isCalendarSyncConnectionActive(
    autoSyncStateQuery.data?.hasGoogleConnection ?? false,
    autoSyncStateQuery.data?.status ?? 'Idle',
  )
  const suggestionsQuery = useCalendarSyncSuggestions({ enabled: isProUser && isReviewMode })
  const dismissSuggestion = useDismissCalendarSuggestion()
  const suggestions: CalendarSyncSuggestion[] = useMemo(
    () => suggestionsQuery.data ?? [],
    [suggestionsQuery.data],
  )

  const incomingEvents: CalendarEvent[] = useMemo(() => {
    if (isReviewMode) return suggestions.map((s) => s.event)
    if (eventsQuery.data?.status === 'connected') return eventsQuery.data.events.filter((event) => !event.isImported)
    return []
  }, [isReviewMode, suggestions, eventsQuery.data])

  const eventsKey = `${isReviewMode ? 'review' : 'manual'}:${weekStartDay}:${incomingEvents.map((e) => e.id).join('|')}`
  if (eventsKey !== previousEventsKey) {
    setPreviousEventsKey(eventsKey)
    setEvents(incomingEvents)
    setVisibleCount(EVENTS_PAGE_SIZE)
    setSelectedIds(
      selectInitialCalendarImportEvent(initialEventId, isReviewMode, incomingEvents, weekStartDay) ??
      resolveSyncedSelection(
        selectedIds,
        incomingEvents.filter((event) => isCalendarSyncEventImportable(event, weekStartDay)),
        isReviewMode,
        previousEventsKey,
      ),
    )
  }

  const importableEvents = useMemo(
    () => events.filter((event) => isCalendarSyncEventImportable(event, weekStartDay)),
    [events, weekStartDay],
  )
  const allSelected =
    importableEvents.length > 0 && selectedIds.size === importableEvents.length

  const activeQuery = isReviewMode ? suggestionsQuery : eventsQuery
  const resolvedStep = resolveCalendarSyncStep({
    wizardStage,
    isOnline,
    isReviewMode,
    isQueryLoading: activeQuery.isLoading,
    isQueryError: activeQuery.isError,
    eventsStatus: eventsQuery.data?.status,
    hasLoadedEvents: events.length > 0,
  })
  const step = resolveCalendarImportConnectionStep(
    resolvedStep, autoSyncStateQuery.isLoading, autoSyncStateQuery.isError,
    googleConnected, isOnline, wizardStage === 'browse',
  )

  const displayedErrorMessage = resolveDisplayedErrorMessage({
    wizardStage,
    errorMessage,
    isQueryError: activeQuery.isError,
    queryError: activeQuery.error,
    translate: t,
  })

  const importedCount = importResult?.imported ?? 0

  useEffect(() => {
    if (profile && !hasProAccess) {
      // react-doctor-disable-next-line nextjs-no-client-side-redirect -- access gate depends on client-fetched profile (hasProAccess); no server-side signal exists https://github.com/thomasluizon/orbit-ui-mobile/issues/243
      router.replace('/upgrade')
    }
  }, [profile, hasProAccess, router])

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(importableEvents.map((event) => event.id)))
    }
  }

  function toggleEvent(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function handleDismissSuggestion(suggestionId: string) {
    if (!isOnline) return
    const requestAccount = getAccountGeneration()
    try {
      await dismissSuggestion.mutateAsync({ id: suggestionId })
    } catch (err: unknown) {
      if (getAccountGeneration() !== requestAccount) return
      toast.error(getFriendlyErrorMessage(err, t, 'calendar.autoSync.syncFailed', 'textless'))
    }
  }

  async function handleConnect() {
    if (!isOnline || isConnecting) return
    const requestAccount = getAccountGeneration()
    setIsConnecting(true)
    try {
      await connectGoogle(isReviewMode)
    } catch {
      if (getAccountGeneration() !== requestAccount) return
      toast.error(t('auth.googleError'))
    } finally {
      if (getAccountGeneration() === requestAccount) setIsConnecting(false)
    }
  }

  function importSelected() {
    if (!isOnline) return
    if (selectedIds.size === 0) return
    const importAccount = getAccountGeneration()
    setWizardStage('importing')

    try {
      const habits = isReviewMode
        ? buildCalendarAutoSyncImportRequest(
            suggestions.filter((s) => selectedIds.has(s.event.id)),
            weekStartDay,
          ).habits
        : buildCalendarSyncImportRequest(events.filter((e) => selectedIds.has(e.id)), weekStartDay).habits

      bulkCreateHabits.mutate(
        { habits },
        {
          onSuccess: (result) => {
            if (getAccountGeneration() !== importAccount) return
            const successCount = result.results.filter((r) => r.status === 'Success').length
            const failedItems = result.results.filter((r) => r.status !== 'Success')
            if (failedItems.length > 0 && successCount === 0) {
              setErrorMessage(failedItems.map((f) => `${f.title ?? t('common.unknown')}: ${f.error ?? t('common.failed')}`).join(', '))
              setWizardStage('error')
              return
            }
            if (failedItems.length > 0) {
              toast.error(
                plural(
                  t('calendar.importPartialFailure', { count: failedItems.length }),
                  failedItems.length,
                ),
              )
            }
            setImportResult({
              imported: successCount,
              habits: result.results.reduce<{ id: string; title: string }[]>((accumulator, item) => {
                if (item.status === 'Success' && item.habitId && item.title) {
                  accumulator.push({ id: item.habitId, title: item.title })
                }
                return accumulator
              }, []),
            })
            setWizardStage('done')
            void queryClient.invalidateQueries({ queryKey: [...calendarKeys.all, 'manual-fetch'] })
            if (isReviewMode) {
              void queryClient.invalidateQueries({
                queryKey: calendarKeys.syncSuggestions(),
              })
            }
          },
          onError: (err: unknown) => {
            if (getAccountGeneration() !== importAccount) return
            setErrorMessage(getFriendlyErrorMessage(err, t, 'calendar.importError', 'generic'))
            setWizardStage('error')
          },
        },
      )
    } catch (err: unknown) {
      if (getAccountGeneration() !== importAccount) return
      setErrorMessage(getFriendlyErrorMessage(err, t, 'calendar.importError', 'generic'))
      setWizardStage('error')
    }
  }

  useImperativeHandle(actionRef, () => ({ importSelected }))
  useEffect(() => {
    onActionStateChange(step === 'select' && events.length > 0
      ? { count: selectedIds.size, disabled: selectedIds.size === 0 || !isOnline }
      : null)
  }, [step, events.length, selectedIds.size, isOnline, accountGeneration, onActionStateChange])
  useEffect(() => () => onActionStateChange(null), [onActionStateChange])

  function handleRetry() {
    setWizardStage('browse')
    if (autoSyncStateQuery.isError) {
      void autoSyncStateQuery.refetch()
      return
    }
    if (isReviewMode) {
      void suggestionsQuery.refetch()
    } else {
      void eventsQuery.refetch()
    }
  }

  function findSuggestionIdForEvent(eventId: string): string | null {
    const match = suggestions.find((s) => s.event.id === eventId)
    return match?.id ?? null
  }

  return (
    <div className="flex flex-col">
      <div className="flex-1 min-h-0 pb-8">
        <CalendarPickerSection enabled={hasProAccess && googleConnected && isOnline} />
        <div>
      {step === 'loading' && (
        <div className="flex flex-col items-center justify-center gap-4 pt-12" role="status" aria-live="polite">
          <Skeleton variant="settings" rows={2} label={t('calendar.fetchingEvents')} />
        </div>
      )}

      {step === 'offline' && (
        <div className="px-4 pt-6">
          <OfflineRefusal icon="calendar" title={t('offline.calendar.title')} reason={t('offline.calendar.reason')} />
        </div>
      )}

      {step === 'not-connected' && (
        <div className="flex flex-col items-center justify-center gap-4 pt-12" role="status" aria-live="polite">
          <div
            className="flex items-center justify-center rounded-full"
            style={{
              width: 64,
              height: 64,
              background: 'var(--bg-well)',
            }}
          >
            <LinkIcon className="size-7 text-[var(--fg-1)]" strokeWidth={1.8} />
          </div>
          <div className="text-center px-6">
            <h2
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 18,
                fontWeight: 500,
                color: 'var(--fg-1)',
                marginBottom: 4,
              }}
            >
              {t('calendar.notConnectedTitle')}
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                lineHeight: 1.5,
                color: 'var(--fg-3)',
              }}
            >
              {t('calendar.notConnectedDesc')}
            </p>
          </div>
          {/* eslint-disable-next-line local/max-button-words -- Google's approved sign-in wording is required. */}
          <PillButton
            onClick={() => {
              void handleConnect()
            }}
            disabled={isConnecting}
          >
            {t('auth.signInWithGoogle')}
          </PillButton>
        </div>
      )}

      {step === 'select' && (
        <div>
          {events.length === 0 ? (
            <EmptyState
              title={
                isReviewMode ? t('calendar.autoSync.reviewModeEmpty') : t('calendar.noEvents')
              }
              action={
                <PillButton variant="ghost" onClick={onClose}>
                  {t('common.goBack')}
                </PillButton>
              }
            />
          ) : (
            <>
              <div data-testid="section-heading-row" className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <SectionLabel>{plural(t('calendar.eventsFound', { count: events.length }), events.length)}</SectionLabel>
                </div>
                <div className="flex shrink-0 items-center pt-6 pr-4 pb-3">
                  <SelectAllToggle
                    allSelected={allSelected}
                    onToggle={toggleAll}
                    selectAllLabel={t('calendar.selectAll')}
                    deselectAllLabel={t('calendar.deselectAll')}
                    disabled={importableEvents.length === 0}
                  />
                </div>
              </div>

              <div>
                {events.slice(0, visibleCount).map((event) => (
                  <CalendarSyncEventRow
                    key={event.id}
                    event={event}
                    weekStartDay={weekStartDay}
                    selected={selectedIds.has(event.id)}
                    isReviewMode={isReviewMode}
                    suggestionId={isReviewMode ? findSuggestionIdForEvent(event.id) : null}
                    dismissPending={dismissSuggestion.isPending || !isOnline}
                    onToggle={toggleEvent}
                    onDismiss={(suggestionId) => void handleDismissSuggestion(suggestionId)}
                    t={t}
                  />
                ))}
              </div>

              {events.length > visibleCount && (
                <div
                  className="flex flex-col items-center"
                  style={{ gap: 8, padding: '12px 16px 0' }}
                >
                  <button
                    type="button"
                    className="chip"
                    onClick={() =>
                      setVisibleCount((count) =>
                        Math.min(count + EVENTS_PAGE_SIZE, events.length),
                      )
                    }
                  >
                    {t('calendar.showMore')}
                  </button>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      color: 'var(--fg-3)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {t('calendar.showingCount', {
                      shown: Math.min(visibleCount, events.length),
                      total: events.length,
                    })}
                  </span>
                </div>
              )}

              <div role="status" style={{ padding: !isOnline ? '16px 16px 0' : undefined }}>
                {!isOnline ? <OfflineRefusal icon="calendar" title={t('offline.calendar.title')} reason={t('offline.calendar.reason')} /> : null}
              </div>
            </>
          )}
        </div>
      )}

      {step === 'importing' && (
        <div className="flex flex-col items-center justify-center gap-4 pt-12" role="status" aria-live="polite">
          <Skeleton variant="settings" rows={2} label={t('calendar.importing')} />
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center justify-center gap-6 pt-12" role="status" aria-live="polite">
          <div
            className="flex items-center justify-center rounded-full"
            style={{
              width: 64,
              height: 64,
              background: 'var(--bg-well)',
            }}
          >
            <Check className="size-8 text-[var(--fg-1)]" strokeWidth={2.2} />
          </div>
          <div className="text-center px-6">
            <h2
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 18,
                fontWeight: 500,
                color: 'var(--fg-1)',
                marginBottom: 4,
              }}
            >
              {t('calendar.importDone')}
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                color: 'var(--fg-2)',
              }}
            >
              {plural(t('calendar.importedCount', { count: importedCount }), importedCount)}
            </p>
          </div>
          {importResult && importResult.habits.length > 0 && (
            <div className="w-full">
              {importResult.habits.map((habit) => (
                <SettingsRow key={habit.id} label={habit.title} accessory="none" />
              ))}
            </div>
          )}
          <PillButton onClick={onGoToHabits}>
            {t('calendar.goToHabits')}
          </PillButton>
        </div>
      )}

      {step === 'error' && (
        <div className="flex flex-col items-center justify-center gap-6 pt-12" role="alert" aria-live="assertive">
          <div
            className="flex items-center justify-center rounded-full"
            style={{
              width: 64,
              height: 64,
              background: 'color-mix(in srgb, var(--status-bad) 15%, transparent)',
            }}
          >
            <AlertTriangle className="size-8 text-[var(--status-bad)]" strokeWidth={1.8} />
          </div>
          <div className="text-center px-6">
            <h2
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 18,
                fontWeight: 500,
                color: 'var(--fg-1)',
                marginBottom: 4,
              }}
            >
              {t('calendar.errorTitle')}
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                lineHeight: 1.5,
                color: 'var(--fg-2)',
              }}
            >
              {autoSyncStateQuery.isError ? t('calendar.fetchError') : displayedErrorMessage}
            </p>
          </div>
          <div className="flex gap-3">
            <PillButton onClick={handleRetry}>{t('calendar.retry')}</PillButton>
            <PillButton variant="ghost" onClick={onClose}>
              {t('common.goBack')}
            </PillButton>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  )
}
