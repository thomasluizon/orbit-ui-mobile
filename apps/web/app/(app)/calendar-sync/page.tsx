'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Loader2,
  Check,
  Link as LinkIcon,
  CalendarDays,
  AlertTriangle,
  Bell,
  RefreshCw,
  X,
} from 'lucide-react'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsDescription } from '@/components/ui/settings-description'
import { SettingsRow } from '@/components/ui/settings-row'
import { MonoToggle } from '@/components/ui/mono-toggle'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import { useProfile, useHasProAccess } from '@/hooks/use-profile'
import { useBulkCreateHabits } from '@/hooks/use-habits'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import {
  useCalendarAutoSyncState,
  useCalendarSyncSuggestions,
  useDismissCalendarSuggestion,
  useRunCalendarSyncNow,
  useSetCalendarAutoSync,
} from '@/hooks/use-calendar-auto-sync'
import { useCalendarEvents } from '@/hooks/use-calendar-events'
import { getSupabaseClient } from '@/lib/supabase'
import type { CalendarSyncEvent, CalendarSyncSuggestion } from '@orbit/shared'
import {
  buildGoogleCalendarOAuthOptions,
  buildCalendarAutoSyncImportRequest,
  buildCalendarSyncImportRequest,
  formatCalendarAutoSyncLastSynced,
  formatCalendarSyncRecurrenceLabel,
  getErrorMessage,
  isCalendarAutoSyncStatusReconnectRequired,
} from '@orbit/shared/utils'
import { toast } from 'sonner'

interface ImportResult {
  imported: number
  habits: { id: string; title: string }[]
}

type Step = 'loading' | 'select' | 'importing' | 'done' | 'error' | 'not-connected'
type WizardStage = 'browse' | 'importing' | 'done' | 'error'
type CalendarEvent = CalendarSyncEvent

async function connectGoogle(): Promise<void> {
  const supabase = getSupabaseClient()
  const redirectTo = `${globalThis.location.origin}/auth-callback`
  sessionStorage.setItem('auth_return_url', '/calendar-sync')

  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: buildGoogleCalendarOAuthOptions({ redirectTo, forceConsent: true }),
  })
}

function AutoSyncSettingsCard() {
  const t = useTranslations()
  const { data: state, isLoading } = useCalendarAutoSyncState()
  const setAutoSync = useSetCalendarAutoSync()
  const runSyncNow = useRunCalendarSyncNow()

  const lastSyncedLabel = useMemo(
    () =>
      formatCalendarAutoSyncLastSynced(
        state?.lastSyncedAt ?? null,
        (key, values) => t(key as never, values as never),
      ),
    [state?.lastSyncedAt, t],
  )

  const showReconnect = isCalendarAutoSyncStatusReconnectRequired(state?.status)
  const hasConnection = state?.hasGoogleConnection === true
  const toggleDisabled = !hasConnection || setAutoSync.isPending
  const enabled = state?.enabled ?? false

  async function handleToggle() {
    if (toggleDisabled) return
    const next = !enabled
    try {
      await setAutoSync.mutateAsync({ enabled: next })
      toast.success(next ? t('calendar.autoSync.enableSuccess') : t('calendar.autoSync.disableSuccess'))
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, t('calendar.autoSync.syncFailed')))
    }
  }

  async function handleSyncNow() {
    try {
      await runSyncNow.mutateAsync()
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, t('calendar.autoSync.syncFailed')))
    }
  }

  return (
    <>
      <SectionLabel>{t('calendar.autoSync.title')}</SectionLabel>
      <SettingsRow label={t('calendar.autoSync.toggleLabel')} accessory="none" divider={false}>
        <MonoToggle
          on={enabled}
          onToggle={handleToggle}
          ariaLabel={t('calendar.autoSync.toggleLabel')}
          disabled={toggleDisabled}
        />
      </SettingsRow>
      <SettingsDescription>{t('calendar.autoSync.description')}</SettingsDescription>

      {isLoading && (
        <div
          className="flex items-center"
          style={{
            padding: '8px 20px 14px',
            gap: 8,
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            color: 'var(--fg-3)',
          }}
        >
          <Loader2 className="size-3 animate-spin" aria-hidden />
          <span>{t('calendar.fetchingEvents')}</span>
        </div>
      )}

      {!isLoading && !hasConnection && (
        <p
          style={{
            padding: '8px 20px 14px',
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            color: 'var(--fg-3)',
          }}
        >
          {t('calendar.autoSync.connectGoogleFirst')}
        </p>
      )}

      {!isLoading && hasConnection && (
        <div
          className="flex flex-wrap items-center justify-between"
          style={{
            padding: '8px 20px 14px',
            gap: 12,
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: 'var(--fg-3)',
            }}
          >
            {lastSyncedLabel}
          </p>
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={runSyncNow.isPending}
            className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--hairline)] px-3 py-1.5 text-xs font-semibold text-[var(--fg-1)] hover:bg-[var(--bg-elev)] transition-colors disabled:opacity-50"
          >
            {runSyncNow.isPending ? (
              <>
                <Loader2 className="size-3 animate-spin" aria-hidden />
                {t('calendar.autoSync.syncNowRunning')}
              </>
            ) : (
              <>
                <RefreshCw className="size-3" aria-hidden />
                {t('calendar.autoSync.syncNow')}
              </>
            )}
          </button>
        </div>
      )}

      {showReconnect && (
        <div
          style={{
            padding: '14px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div className="flex items-start gap-2 text-[var(--status-overdue)]">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" aria-hidden />
            <div className="flex-1 min-w-0">
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {t('calendar.autoSync.reconnectTitle')}
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  marginTop: 4,
                  color: 'var(--fg-3)',
                  lineHeight: 1.5,
                }}
              >
                {t('calendar.autoSync.reconnectBody')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={connectGoogle}
            className="rounded-[var(--radius-md)] border border-[var(--hairline)] text-[var(--status-overdue)] font-semibold py-2 px-3 text-xs hover:bg-[var(--bg-elev)] transition-colors self-start"
          >
            {t('calendar.autoSync.reconnectCta')}
          </button>
        </div>
      )}
    </>
  )
}

export default function CalendarSyncPage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()
  const bulkCreateHabits = useBulkCreateHabits()

  const isReviewMode = searchParams.get('mode') === 'review'
  const isProUser = Boolean(profile) && hasProAccess

  const [wizardStage, setWizardStage] = useState<WizardStage>('browse')
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [errorMessage, setErrorMessage] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [previousEventsKey, setPreviousEventsKey] = useState<string | null>(null)

  const eventsQuery = useCalendarEvents({ enabled: isProUser && !isReviewMode })
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
    if (isReviewMode && previousEventsKey !== null) {
      setSelectedIds((prev) => {
        const next = new Set<string>()
        for (const ev of incomingEvents) {
          if (prev.has(ev.id)) next.add(ev.id)
        }
        return next
      })
    } else {
      setSelectedIds(new Set(incomingEvents.map((e) => e.id)))
    }
  }

  const allSelected = events.length > 0 && selectedIds.size === events.length

  const activeQuery = isReviewMode ? suggestionsQuery : eventsQuery
  const step: Step = ((): Step => {
    if (wizardStage === 'importing') return 'importing'
    if (wizardStage === 'done') return 'done'
    if (wizardStage === 'error') return 'error'
    if (activeQuery.isLoading) return 'loading'
    if (activeQuery.isError) return 'error'
    if (!isReviewMode && eventsQuery.data?.status === 'not-connected') {
      return 'not-connected'
    }
    return 'select'
  })()

  const displayedErrorMessage =
    wizardStage === 'error'
      ? errorMessage
      : activeQuery.isError
        ? getErrorMessage(activeQuery.error, t('calendar.fetchError'))
        : ''

  useEffect(() => {
    if (profile && !hasProAccess) {
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
      toast.error(getErrorMessage(err, t('calendar.autoSync.syncFailed')))
    }
  }

  async function importSelected() {
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
            setImportResult({ imported: successCount, habits: [] })
            setWizardStage('done')
          },
          onError: (err: unknown) => {
            setErrorMessage(getErrorMessage(err, t('calendar.importError')))
            setWizardStage('error')
          },
        },
      )
    } catch (err: unknown) {
      setErrorMessage(getErrorMessage(err, t('calendar.importError')))
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

  function renderEmptyState() {
    const title = isReviewMode ? t('calendar.autoSync.reviewModeEmpty') : t('calendar.noEvents')
    return (
      <div className="text-center pt-12" role="status" aria-live="polite">
        <CalendarDays className="size-12 text-[var(--fg-3)] mx-auto mb-4" />
        <p className="text-[var(--fg-2)]">{title}</p>
        <button
          type="button"
          className="inline-block mt-4 text-[var(--primary)] font-semibold text-sm hover:underline"
          onClick={() => goBackOrFallback('/profile')}
        >
          {t('common.goBack')}
        </button>
      </div>
    )
  }

  function findSuggestionIdForEvent(eventId: string): string | null {
    const match = suggestions.find((s) => s.event.id === eventId)
    return match?.id ?? null
  }

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <AppBar
        back
        backLabel={t('common.backToProfile')}
        onBack={() => goBackOrFallback('/profile')}
        title={isReviewMode ? t('calendar.autoSync.reviewModeTitle') : t('calendar.title')}
      />

      <div className="flex-1 min-h-0 overflow-y-auto pb-8">
        {hasProAccess && <AutoSyncSettingsCard />}

      {step === 'loading' && (
        <div className="flex flex-col items-center justify-center gap-4 pt-12" role="status" aria-live="polite">
          <Loader2 className="size-8 animate-spin text-[var(--primary)]" />
          <p className="text-[var(--fg-2)] text-sm">{t('calendar.fetchingEvents')}</p>
        </div>
      )}

      {step === 'not-connected' && !isReviewMode && (
        <div className="flex flex-col items-center justify-center gap-5 pt-12" role="status" aria-live="polite">
          <div className="size-14 rounded-full border border-[var(--hairline)] flex items-center justify-center">
            <LinkIcon className="size-7 text-[var(--primary)]" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold text-[var(--fg-1)] mb-1">{t('calendar.notConnectedTitle')}</h2>
            <p className="text-sm text-[var(--fg-3)]">{t('calendar.notConnectedDesc')}</p>
          </div>
          <button
            className="inline-flex items-center justify-center bg-[var(--primary)] text-[var(--fg-on-primary)] font-semibold py-2.5 px-5 rounded-[var(--radius-md)] text-sm hover:bg-[var(--primary-pressed)] transition-colors"
            onClick={connectGoogle}
          >
            {t('auth.signInWithGoogle')}
          </button>
        </div>
      )}

      {step === 'select' && (
        <div className="space-y-4 px-5 pt-6">
          {events.length === 0 ? (
            renderEmptyState()
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-[var(--fg-2)]">
                  {plural(t('calendar.eventsFound', { count: events.length }), events.length)}
                </p>
                <button
                  className="text-xs font-semibold text-[var(--primary)] hover:text-[var(--primary-pressed)] transition-colors"
                  onClick={toggleAll}
                  aria-pressed={allSelected}
                >
                  {allSelected ? t('calendar.deselectAll') : t('calendar.selectAll')}
                </button>
              </div>

              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {events.map((event) => {
                  const suggestionId = isReviewMode ? findSuggestionIdForEvent(event.id) : null
                  return (
                    <div
                      key={event.id}
                      className={`w-full rounded-[12px] p-4 transition-[background-color,border-color] border ${
                        selectedIds.has(event.id)
                          ? 'bg-[var(--bg-sunk)] border-[var(--hairline-strong)]'
                          : 'bg-[var(--bg-elev)] border-[var(--hairline)]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => toggleEvent(event.id)}
                          aria-pressed={selectedIds.has(event.id)}
                          className="flex-1 text-left flex items-start gap-3"
                        >
                          <div
                            className={`shrink-0 mt-0.5 size-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                              selectedIds.has(event.id)
                                ? 'bg-[var(--primary)] border-[var(--primary)]'
                                : 'border-[var(--hairline)]'
                            }`}
                          >
                            {selectedIds.has(event.id) && <Check className="size-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[var(--fg-1)] truncate">{event.title}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              {event.startDate && (
                                <span className="text-xs text-[var(--fg-2)]">
                                  {event.startDate}
                                </span>
                              )}
                              {event.startTime && (
                                <span className="text-xs text-[var(--fg-3)]">
                                  {event.startTime}{event.endTime ? ` - ${event.endTime}` : ''}
                                </span>
                              )}
                              {event.isRecurring && (
                                <span className="text-[10px] font-bold uppercase tracking-wider bg-[var(--bg-elev)] text-[var(--primary)] px-1.5 py-0.5 rounded-full">
                                  {formatCalendarSyncRecurrenceLabel(event.recurrenceRule, {
                                    translate: (key, values) => t(key as never, values as never),
                                    pluralize: plural,
                                  }) || t('calendar.recurring')}
                                </span>
                              )}
                              {event.reminders.length > 0 && (
                                <span className="text-[10px] text-[var(--fg-3)]">
                                  <Bell className="size-3 inline" />
                                  {event.reminders.length}
                                </span>
                              )}
                            </div>
                            {event.description && (
                              <p className="text-xs text-[var(--fg-3)] mt-1 line-clamp-1">
                                {event.description}
                              </p>
                            )}
                          </div>
                        </button>

                        {isReviewMode && suggestionId && (
                          <button
                            type="button"
                            onClick={() => handleDismissSuggestion(suggestionId)}
                            disabled={dismissSuggestion.isPending}
                            aria-label={t('calendar.autoSync.dismissSuggestion')}
                            className="shrink-0 p-1.5 rounded-full text-[var(--fg-3)] hover:text-[var(--fg-1)] hover:bg-[var(--bg-elev)] transition-colors disabled:opacity-50"
                          >
                            <X className="size-4" aria-hidden />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="pt-2">
                <button
                  className="w-full py-3.5 rounded-[12px] bg-[var(--primary)] text-white font-bold text-sm hover:bg-[var(--primary-pressed)] transition-[background-color,transform,opacity] active:scale-[0.98] disabled:opacity-50"
                  disabled={selectedIds.size === 0}
                  onClick={importSelected}
                >
                  {plural(t('calendar.importButton', { count: selectedIds.size }), selectedIds.size)}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {step === 'importing' && (
        <div className="flex flex-col items-center justify-center gap-4 pt-12" role="status" aria-live="polite">
          <Loader2 className="size-8 animate-spin text-[var(--primary)]" />
          <p className="text-[var(--fg-2)] text-sm">{t('calendar.importing')}</p>
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center justify-center gap-6 pt-12" role="status" aria-live="polite">
          <div className="size-16 rounded-full bg-[var(--status-done)]/15 flex items-center justify-center">
            <Check className="size-8 text-[var(--status-done)]" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-[var(--fg-1)] mb-2">{t('calendar.importDone')}</h2>
            <p className="text-sm text-[var(--fg-2)]">
              {plural(t('calendar.importedCount', { count: importResult?.imported ?? 0 }), importResult?.imported ?? 0)}
            </p>
          </div>
          <Link
            href="/"
            className="bg-[var(--primary)] text-white font-bold py-3 px-8 rounded-[12px] text-sm hover:bg-[var(--primary-pressed)] transition-colors"
          >
            {t('calendar.goToHabits')}
          </Link>
        </div>
      )}

      {step === 'error' && (
        <div className="flex flex-col items-center justify-center gap-6 pt-12" role="alert" aria-live="assertive">
          <div className="size-16 rounded-full bg-[var(--status-bad)]/15 flex items-center justify-center">
            <AlertTriangle className="size-8 text-[var(--status-bad)]" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-[var(--fg-1)] mb-2">{t('calendar.errorTitle')}</h2>
            <p className="text-sm text-[var(--fg-2)]">{displayedErrorMessage}</p>
          </div>
          <div className="flex gap-3">
            <button
              className="bg-[var(--primary)] text-white font-bold py-3 px-6 rounded-[12px] text-sm hover:bg-[var(--primary-pressed)] transition-colors"
              onClick={handleRetry}
            >
              {t('calendar.retry')}
            </button>
            <button
              type="button"
              className="border border-[var(--hairline)] text-[var(--fg-2)] font-bold py-3 px-6 rounded-[12px] text-sm hover:bg-[var(--bg-elev)] transition-colors"
              onClick={() => goBackOrFallback('/profile')}
            >
              {t('common.goBack')}
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
