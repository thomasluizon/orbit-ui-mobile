'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Loader2,
  Check,
  Link as LinkIcon,
  CalendarDays,
  AlertTriangle,
  Bell,
  RefreshCw,
  X,
} from 'lucide-react'
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
import { getSupabaseClient } from '@/lib/supabase'
import { API } from '@orbit/shared/api'
import type { CalendarSyncEvent, CalendarSyncSuggestion } from '@orbit/shared'
import {
  buildCalendarAutoSyncImportRequest,
  buildCalendarSyncImportRequest,
  formatCalendarAutoSyncLastSynced,
  formatCalendarSyncRecurrenceLabel,
  getErrorMessage,
  isCalendarAutoSyncStatusReconnectRequired,
  isCalendarSyncNotConnectedMessage,
} from '@orbit/shared/utils'
import { toast } from 'sonner'

interface ImportResult {
  imported: number
  habits: { id: string; title: string }[]
}

type Step = 'loading' | 'select' | 'importing' | 'done' | 'error' | 'not-connected'
type CalendarEvent = CalendarSyncEvent

// ---------------------------------------------------------------------------
// Standalone helpers (S7721: moved to module scope)
// ---------------------------------------------------------------------------

async function connectGoogle(): Promise<void> {
  const supabase = getSupabaseClient()
  const redirectTo = `${globalThis.location.origin}/auth-callback`
  sessionStorage.setItem('auth_return_url', '/calendar-sync')

  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      scopes: 'https://www.googleapis.com/auth/calendar.readonly',
      queryParams: {
        access_type: 'offline',
      },
    },
  })
}

// ---------------------------------------------------------------------------
// Auto-sync settings card
// ---------------------------------------------------------------------------

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
    <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
            {t('calendar.autoSync.title')}
          </h2>
          <p className="text-xs text-text-muted mt-1">{t('calendar.autoSync.description')}</p>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          aria-label={t('calendar.autoSync.toggleLabel')}
          disabled={toggleDisabled}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 ${
            enabled ? 'bg-primary' : 'bg-surface-elevated'
          }`}
          onClick={handleToggle}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Loader2 className="size-3 animate-spin" aria-hidden />
          <span>{t('calendar.fetchingEvents')}</span>
        </div>
      )}

      {!isLoading && !hasConnection && (
        <p className="text-xs text-text-muted">{t('calendar.autoSync.connectGoogleFirst')}</p>
      )}

      {!isLoading && hasConnection && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-text-muted">{lastSyncedLabel}</p>
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={runSyncNow.isPending}
            className="inline-flex items-center gap-2 rounded-[var(--radius-lg)] border border-border px-3 py-2 text-xs font-semibold text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-50"
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
        <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-700 dark:text-yellow-400 rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" aria-hidden />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{t('calendar.autoSync.reconnectTitle')}</p>
              <p className="text-xs mt-1 opacity-90">{t('calendar.autoSync.reconnectBody')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={connectGoogle}
            className="w-full rounded-[var(--radius-lg)] bg-yellow-500 text-white font-bold py-2 text-xs hover:bg-yellow-500/90 transition-colors"
          >
            {t('calendar.autoSync.reconnectCta')}
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CalendarSyncPage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()
  const bulkCreateHabits = useBulkCreateHabits()

  const isReviewMode = searchParams.get('mode') === 'review'

  const [step, setStep] = useState<Step>('loading')
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [errorMessage, setErrorMessage] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  // Review mode hooks (only drive behavior when isReviewMode)
  const suggestionsQuery = useCalendarSyncSuggestions()
  const dismissSuggestion = useDismissCalendarSuggestion()
  const suggestions: CalendarSyncSuggestion[] = useMemo(
    () => suggestionsQuery.data ?? [],
    [suggestionsQuery.data],
  )

  const allSelected = events.length > 0 && selectedIds.size === events.length

  // Redirect non-Pro users
  useEffect(() => {
    if (profile && !hasProAccess) {
      router.push('/upgrade')
    }
  }, [profile, hasProAccess, router])

  // Manual flow: fetch events from /api/calendar/events
  const fetchEvents = useCallback(async () => {
    setStep('loading')
    try {
      const res = await fetch(API.calendar.events)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const msg = body?.error ?? body?.message ?? `Failed with status ${res.status}`
        const lower = msg.toLowerCase()
        if (isCalendarSyncNotConnectedMessage(lower)) {
          setStep('not-connected')
          return
        }
        throw new Error(msg)
      }
      const data: CalendarEvent[] = await res.json()
      setEvents(data)
      setSelectedIds(new Set(data.map((e) => e.id)))
      setStep('select')
    } catch (err: unknown) {
      setErrorMessage(getErrorMessage(err, t('calendar.fetchError')))
      setStep('error')
    }
  }, [t])

  useEffect(() => {
    if (!profile || !hasProAccess) return
    if (isReviewMode) return
    fetchEvents()
  }, [profile, hasProAccess, fetchEvents, isReviewMode])

  // Review mode: sync suggestions into local selection state
  useEffect(() => {
    if (!isReviewMode) return
    if (suggestionsQuery.isLoading) {
      setStep('loading')
      return
    }
    if (suggestionsQuery.isError) {
      setErrorMessage(getErrorMessage(suggestionsQuery.error, t('calendar.fetchError')))
      setStep('error')
      return
    }
    const derived = suggestions.map((s) => s.event)
    setEvents(derived)
    setSelectedIds((prev) => {
      // Preserve previous selections where the id still exists; default to all selected for new ids
      const next = new Set<string>()
      for (const ev of derived) {
        if (prev.has(ev.id) || !prev.size) {
          next.add(ev.id)
        }
      }
      // If prev was empty (first sync), select all
      if (!prev.size) return new Set(derived.map((e) => e.id))
      return next
    })
    setStep('select')
  }, [
    isReviewMode,
    suggestions,
    suggestionsQuery.isLoading,
    suggestionsQuery.isError,
    suggestionsQuery.error,
    t,
  ])

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
    setStep('importing')

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
              setStep('error')
              return
            }
            setImportResult({ imported: successCount, habits: [] })
            setStep('done')
          },
          onError: (err: unknown) => {
            setErrorMessage(getErrorMessage(err, t('calendar.importError')))
            setStep('error')
          },
        },
      )
    } catch (err: unknown) {
      setErrorMessage(getErrorMessage(err, t('calendar.importError')))
      setStep('error')
    }
  }

  function renderEmptyState() {
    const title = isReviewMode ? t('calendar.autoSync.reviewModeEmpty') : t('calendar.noEvents')
    return (
      <div className="text-center pt-12" role="status" aria-live="polite">
        <CalendarDays className="size-12 text-text-muted mx-auto mb-4" />
        <p className="text-text-secondary">{title}</p>
        <button
          type="button"
          className="inline-block mt-4 text-primary font-semibold text-sm hover:underline"
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
    <div className="pb-8 space-y-6">
      {/* Header */}
      <header className="pt-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={t('common.backToProfile')}
            className="p-2 rounded-full hover:bg-surface transition-colors"
            onClick={() => goBackOrFallback('/profile')}
          >
            <ArrowLeft className="size-4 text-text-primary" />
          </button>
          <h1 className="text-[length:var(--text-fluid-xl)] font-bold text-text-primary">
            {isReviewMode ? t('calendar.autoSync.reviewModeTitle') : t('calendar.title')}
          </h1>
        </div>
      </header>

      {/* Auto-sync settings card (always visible at top) */}
      <AutoSyncSettingsCard />

      {/* Loading */}
      {step === 'loading' && (
        <div className="flex flex-col items-center justify-center gap-4 pt-12" role="status" aria-live="polite">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-text-secondary text-sm">{t('calendar.fetchingEvents')}</p>
        </div>
      )}

      {/* Not Connected (manual flow only) */}
      {step === 'not-connected' && !isReviewMode && (
        <div className="flex flex-col items-center justify-center gap-6 pt-12" role="status" aria-live="polite">
          <div className="size-16 rounded-full bg-primary/15 flex items-center justify-center">
            <LinkIcon className="size-8 text-primary" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-text-primary mb-2">{t('calendar.notConnectedTitle')}</h2>
            <p className="text-sm text-text-secondary">{t('calendar.notConnectedDesc')}</p>
          </div>
          <button
            className="bg-primary text-white font-bold py-3 px-8 rounded-[var(--radius-xl)] text-sm hover:bg-primary/90 transition-all"
            onClick={connectGoogle}
          >
            {t('auth.signInWithGoogle')}
          </button>
        </div>
      )}

      {/* Event Selection */}
      {step === 'select' && (
        <div className="space-y-4">
          {events.length === 0 ? (
            renderEmptyState()
          ) : (
            <>
              {/* Select all toggle */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-text-secondary">
                  {plural(t('calendar.eventsFound', { count: events.length }), events.length)}
                </p>
                <button
                  className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                  onClick={toggleAll}
                  aria-pressed={allSelected}
                >
                  {allSelected ? t('calendar.deselectAll') : t('calendar.selectAll')}
                </button>
              </div>

              {/* Event list */}
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {events.map((event) => {
                  const suggestionId = isReviewMode ? findSuggestionIdForEvent(event.id) : null
                  return (
                    <div
                      key={event.id}
                      className={`w-full rounded-2xl p-4 transition-all border ${
                        selectedIds.has(event.id)
                          ? 'bg-primary/10 border-primary/30'
                          : 'bg-surface border-border'
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
                                ? 'bg-primary border-primary'
                                : 'border-border'
                            }`}
                          >
                            {selectedIds.has(event.id) && <Check className="size-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-text-primary truncate">{event.title}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              {event.startDate && (
                                <span className="text-xs text-text-secondary">
                                  {event.startDate}
                                </span>
                              )}
                              {event.startTime && (
                                <span className="text-xs text-text-muted">
                                  {event.startTime}{event.endTime ? ` - ${event.endTime}` : ''}
                                </span>
                              )}
                              {event.isRecurring && (
                                <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">
                                  {formatCalendarSyncRecurrenceLabel(event.recurrenceRule, {
                                    translate: (key, values) => t(key as never, values as never),
                                    pluralize: plural,
                                  }) || t('calendar.recurring')}
                                </span>
                              )}
                              {event.reminders.length > 0 && (
                                <span className="text-[10px] text-text-muted">
                                  <Bell className="size-3 inline" />
                                  {event.reminders.length}
                                </span>
                              )}
                            </div>
                            {event.description && (
                              <p className="text-xs text-text-muted mt-1 line-clamp-1">
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
                            className="shrink-0 p-1.5 rounded-full text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-50"
                          >
                            <X className="size-4" aria-hidden />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Import button */}
              <div className="pt-2">
                <button
                  className="w-full py-3.5 rounded-[var(--radius-xl)] bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-all active:scale-[0.98] shadow-[var(--shadow-glow)] disabled:opacity-50"
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

      {/* Importing */}
      {step === 'importing' && (
        <div className="flex flex-col items-center justify-center gap-4 pt-12" role="status" aria-live="polite">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-text-secondary text-sm">{t('calendar.importing')}</p>
        </div>
      )}

      {/* Done */}
      {step === 'done' && (
        <div className="flex flex-col items-center justify-center gap-6 pt-12" role="status" aria-live="polite">
          <div className="size-16 rounded-full bg-green-500/15 flex items-center justify-center">
            <Check className="size-8 text-green-400" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-text-primary mb-2">{t('calendar.importDone')}</h2>
            <p className="text-sm text-text-secondary">
              {plural(t('calendar.importedCount', { count: importResult?.imported ?? 0 }), importResult?.imported ?? 0)}
            </p>
          </div>
          <Link
            href="/"
            className="bg-primary text-white font-bold py-3 px-8 rounded-[var(--radius-xl)] text-sm hover:bg-primary/90 transition-all"
          >
            {t('calendar.goToHabits')}
          </Link>
        </div>
      )}

      {/* Error */}
      {step === 'error' && (
        <div className="flex flex-col items-center justify-center gap-6 pt-12" role="alert" aria-live="assertive">
          <div className="size-16 rounded-full bg-red-500/15 flex items-center justify-center">
            <AlertTriangle className="size-8 text-red-400" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-text-primary mb-2">{t('calendar.errorTitle')}</h2>
            <p className="text-sm text-text-secondary">{errorMessage}</p>
          </div>
          <div className="flex gap-3">
            <button
              className="bg-primary text-white font-bold py-3 px-6 rounded-[var(--radius-xl)] text-sm hover:bg-primary/90 transition-all"
              onClick={isReviewMode ? () => suggestionsQuery.refetch() : fetchEvents}
            >
              {t('calendar.retry')}
            </button>
            <button
              type="button"
              className="border border-border text-text-secondary font-bold py-3 px-6 rounded-[var(--radius-xl)] text-sm hover:bg-surface transition-all"
              onClick={() => goBackOrFallback('/profile')}
            >
              {t('common.goBack')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
