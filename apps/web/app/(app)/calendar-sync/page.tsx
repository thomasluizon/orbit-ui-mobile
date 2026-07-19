'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Loader2,
  Check,
  AlertTriangle,
  WifiOff,
} from '@/components/ui/icons'
import { useQueryClient } from '@tanstack/react-query'
import { AppBar } from '@/components/ui/app-bar'
import { PillButton } from '@/components/ui/pill-button'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { EmptyState } from '@/components/ui/empty-state'
import { useTopbarHeading } from '@/components/shell/topbar-slot'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import { useProfile, useHasProAccess } from '@/hooks/use-profile'
import { useBulkCreateHabits } from '@/hooks/use-habits'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useOffline } from '@/hooks/use-offline'
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
import { CalendarPickerSection } from './_components/calendar-picker-section'
import { AutoSyncSettingsCard } from './_components/auto-sync-settings-card'
import { CalendarSyncEventRow } from './_components/calendar-sync-event-row'
import { SelectAllToggle } from './_components/select-all-toggle'
import { connectGoogle } from './_components/connect-google'
import type { CalendarSyncEvent, CalendarSyncSuggestion } from '@orbit/shared'
import { calendarKeys } from '@orbit/shared/query'
import {
  buildCalendarAutoSyncImportRequest,
  buildCalendarSyncImportRequest,
  getFriendlyErrorMessage,
} from '@orbit/shared/utils'
import { toast } from 'sonner'

interface ImportResult {
  imported: number
  habits: { id: string; title: string }[]
}

const EVENTS_PAGE_SIZE = 20

type CalendarEvent = CalendarSyncEvent

export default function CalendarSyncPage() {
  return (
    <Suspense fallback={null}>
      <CalendarSyncPageContent />
    </Suspense>
  )
}

// react-doctor-disable-next-line no-giant-component -- step-based import wizard with six mutually-exclusive render branches; extraction deferred to avoid regression in the import flow without visual QA https://github.com/thomasluizon/orbit-ui-mobile/issues/243
function CalendarSyncPageContent() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()
  const bulkCreateHabits = useBulkCreateHabits()
  const queryClient = useQueryClient()
  const { isOnline } = useOffline()

  const isReviewMode = searchParams.get('mode') === 'review'
  const isProUser = Boolean(profile) && hasProAccess

  const [wizardStage, setWizardStage] = useState<WizardStage>('browse')
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [errorMessage, setErrorMessage] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [previousEventsKey, setPreviousEventsKey] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(EVENTS_PAGE_SIZE)

  useTopbarHeading({
    title: isReviewMode ? t('calendar.autoSync.reviewModeTitle') : undefined,
  })

  const eventsQuery = useCalendarEvents({ enabled: isProUser && !isReviewMode })
  const autoSyncStateQuery = useCalendarAutoSyncState({ enabled: isProUser })
  const googleConnected = autoSyncStateQuery.data?.hasGoogleConnection === true
  const suggestionsQuery = useCalendarSyncSuggestions({ enabled: isProUser && isReviewMode })
  const dismissSuggestion = useDismissCalendarSuggestion()
  const suggestions: CalendarSyncSuggestion[] = useMemo(
    () => suggestionsQuery.data ?? [],
    [suggestionsQuery.data],
  )

  const incomingEvents: CalendarEvent[] = useMemo(() => {
    if (isReviewMode) return suggestions.map((s) => s.event)
    if (eventsQuery.data?.status === 'connected') return eventsQuery.data.events
    return []
  }, [isReviewMode, suggestions, eventsQuery.data])

  const eventsKey = `${isReviewMode ? 'review' : 'manual'}:${incomingEvents.map((e) => e.id).join('|')}`
  if (eventsKey !== previousEventsKey) {
    setPreviousEventsKey(eventsKey)
    setEvents(incomingEvents)
    setVisibleCount(EVENTS_PAGE_SIZE)
    setSelectedIds(
      resolveSyncedSelection(selectedIds, incomingEvents, isReviewMode, previousEventsKey),
    )
  }

  const allSelected = events.length > 0 && selectedIds.size === events.length

  const activeQuery = isReviewMode ? suggestionsQuery : eventsQuery
  const step = resolveCalendarSyncStep({
    wizardStage,
    isOnline,
    isReviewMode,
    isQueryLoading: activeQuery.isLoading,
    isQueryError: activeQuery.isError,
    eventsStatus: eventsQuery.data?.status,
  })

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
      setSelectedIds(new Set(events.map((e) => e.id)))
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
    try {
      await dismissSuggestion.mutateAsync({ id: suggestionId })
    } catch (err: unknown) {
      toast.error(getFriendlyErrorMessage(err, t, 'calendar.autoSync.syncFailed', 'generic'))
    }
  }

  async function handleConnect() {
    if (!isOnline || isConnecting) return
    setIsConnecting(true)
    try {
      await connectGoogle()
    } catch {
      toast.error(t('auth.googleError'))
    } finally {
      setIsConnecting(false)
    }
  }

  function importSelected() {
    if (!isOnline) return
    if (selectedIds.size === 0) return
    setWizardStage('importing')

    try {
      const habits = isReviewMode
        ? buildCalendarAutoSyncImportRequest(
            suggestions.filter((s) => selectedIds.has(s.event.id)),
          ).habits
        : buildCalendarSyncImportRequest(events.filter((e) => selectedIds.has(e.id))).habits

      bulkCreateHabits.mutate(
        { habits },
        {
          onSuccess: (result) => {
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
            if (isReviewMode) {
              void queryClient.invalidateQueries({
                queryKey: calendarKeys.syncSuggestions(),
              })
            }
          },
          onError: (err: unknown) => {
            setErrorMessage(getFriendlyErrorMessage(err, t, 'calendar.importError', 'generic'))
            setWizardStage('error')
          },
        },
      )
    } catch (err: unknown) {
      setErrorMessage(getFriendlyErrorMessage(err, t, 'calendar.importError', 'generic'))
      setWizardStage('error')
    }
  }

  function handleRetry() {
    setWizardStage('browse')
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
    <div className="md:mx-auto md:max-w-[760px]">
      <div className="flex flex-col min-h-[100dvh]">
      <AppBar
        back
        backLabel={t('common.backToProfile')}
        onBack={() => goBackOrFallback('/profile')}
        title={isReviewMode ? t('calendar.autoSync.reviewModeTitle') : t('calendar.title')}
      />

      <div className="flex-1 min-h-0 overflow-y-auto pb-8">
        <div>
          {hasProAccess && (
            <>
              <AutoSyncSettingsCard />
              <CalendarPickerSection enabled={googleConnected && isOnline} />
            </>
          )}
        </div>

        <div>
      {step === 'loading' && (
        <div className="flex flex-col items-center justify-center gap-4 pt-12" role="status" aria-live="polite">
          <Loader2 className="size-8 animate-spin text-[var(--primary)]" />
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              color: 'var(--fg-2)',
            }}
          >
            {t('calendar.fetchingEvents')}
          </p>
        </div>
      )}

      {step === 'not-connected' && !isReviewMode && (
        <div role="status" aria-live="polite">
          <EmptyState
            title={t('calendar.notConnectedTitle')}
            description={t('calendar.notConnectedDesc')}
            action={{
              label: t('auth.signInWithGoogle'),
              onClick: () => {
                void handleConnect()
              },
              disabled: isConnecting,
            }}
          />
        </div>
      )}

      {step === 'offline' && (
        <div role="status" aria-live="polite">
          <EmptyState
            icon={WifiOff}
            title={t('offline.title')}
            description={t('offline.description')}
          />
        </div>
      )}

      {step === 'select' && (
        <div>
          {events.length === 0 ? (
            <EmptyState
              description={
                isReviewMode ? t('calendar.autoSync.reviewModeEmpty') : t('calendar.noEvents')
              }
              action={{
                label: t('common.goBack'),
                onClick: () => goBackOrFallback('/profile'),
                variant: 'secondary',
              }}
            />
          ) : (
            <>
              <SectionLabel
                trailing={
                  <SelectAllToggle
                    allSelected={allSelected}
                    onToggle={toggleAll}
                    selectAllLabel={t('calendar.selectAll')}
                    deselectAllLabel={t('calendar.deselectAll')}
                  />
                }
              >
                {plural(t('calendar.eventsFound', { count: events.length }), events.length)}
              </SectionLabel>

              <div className="stagger-enter">
                {events.slice(0, visibleCount).map((event) => (
                  <CalendarSyncEventRow
                    key={event.id}
                    event={event}
                    selected={selectedIds.has(event.id)}
                    isReviewMode={isReviewMode}
                    suggestionId={isReviewMode ? findSuggestionIdForEvent(event.id) : null}
                    dismissPending={dismissSuggestion.isPending}
                    onToggle={toggleEvent}
                    onDismiss={(suggestionId) => void handleDismissSuggestion(suggestionId)}
                    t={t}
                  />
                ))}
              </div>

              {events.length > visibleCount && (
                <div
                  className="flex flex-col items-center"
                  style={{ gap: 8, padding: '14px 20px 0' }}
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

              <div className="md:flex md:justify-center" style={{ padding: '18px 20px 0' }}>
                <PillButton
                  fullWidth
                  disabled={selectedIds.size === 0 || !isOnline}
                  onClick={() => importSelected()}
                >
                  {plural(t('calendar.importButton', { count: selectedIds.size }), selectedIds.size)}
                </PillButton>
              </div>
            </>
          )}
        </div>
      )}

      {step === 'importing' && (
        <div className="flex flex-col items-center justify-center gap-4 pt-12" role="status" aria-live="polite">
          <Loader2 className="size-8 animate-spin text-[var(--primary)]" />
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              color: 'var(--fg-2)',
            }}
          >
            {t('calendar.importing')}
          </p>
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center justify-center gap-6 pt-12" role="status" aria-live="polite">
          <div
            className="flex items-center justify-center rounded-full"
            style={{
              width: 64,
              height: 64,
              background: 'rgba(var(--primary-rgb), 0.15)',
              boxShadow: 'inset 0 0 0 1.5px rgba(var(--primary-rgb), 0.35)',
            }}
          >
            <Check className="size-8 text-[var(--status-done)]" strokeWidth={2.2} />
          </div>
          <div className="text-center px-6">
            <h2
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 18,
                fontWeight: 500,
                color: 'var(--fg-1)',
                marginBottom: 6,
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
          <PillButton onClick={() => router.push('/')}>
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
              boxShadow: 'inset 0 0 0 1.5px color-mix(in srgb, var(--status-bad) 35%, transparent)',
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
                marginBottom: 6,
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
              {displayedErrorMessage}
            </p>
          </div>
          <div className="flex gap-3">
            <PillButton onClick={handleRetry}>{t('calendar.retry')}</PillButton>
            <PillButton variant="ghost" onClick={() => goBackOrFallback('/profile')}>
              {t('common.goBack')}
            </PillButton>
          </div>
        </div>
      )}
        </div>
      </div>
      </div>
    </div>
  )
}
