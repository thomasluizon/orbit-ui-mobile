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
import { Switch } from '@/components/ui/settings-row'
import { RadioGlyph } from '@/components/ui/select-check'
import { Badge } from '@/components/ui/badge'
import { PillButton } from '@/components/ui/pill-button'
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

function QuietActionButton({
  onClick,
  disabled = false,
  tone = 'default',
  ariaLabel,
  children,
}: Readonly<{
  onClick: () => void
  disabled?: boolean
  tone?: 'default' | 'warning'
  ariaLabel?: string
  children: React.ReactNode
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="inline-flex items-center appearance-none border-0 bg-transparent cursor-pointer transition-[color,opacity] duration-150 ease-out hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        gap: 7,
        minHeight: 44,
        padding: '0 6px',
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        fontWeight: 500,
        color: tone === 'warning' ? 'var(--status-overdue)' : 'var(--fg-2)',
      }}
    >
      {children}
    </button>
  )
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

  const statusMeta = (() => {
    if (isLoading) return t('calendar.fetchingEvents')
    if (!hasConnection) return t('calendar.autoSync.connectGoogleFirst')
    return lastSyncedLabel
  })()

  return (
    <>
      <SectionLabel bottom={10}>{t('calendar.autoSync.title')}</SectionLabel>
      <div style={{ padding: '0 20px' }}>
        <div
          className="flex items-center"
          style={{
            gap: 14,
            padding: '16px 18px',
            borderRadius: 16,
            background: 'var(--bg-card)',
            boxShadow: 'inset 0 0 0 1px var(--hairline)',
          }}
        >
          <span
            aria-hidden="true"
            className="inline-flex justify-center shrink-0"
            style={{ width: 26 }}
          >
            <CalendarDays size={22} strokeWidth={1.8} color="var(--fg-1)" />
          </span>
          <div className="flex-1 min-w-0">
            <div
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 18,
                fontWeight: 400,
                lineHeight: 1.25,
                color: 'var(--fg-1)',
              }}
            >
              Google Calendar
            </div>
            <div
              className="flex items-center"
              style={{
                gap: 6,
                marginTop: 3,
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                lineHeight: 1.4,
                color: 'var(--fg-3)',
              }}
            >
              {isLoading && <Loader2 className="size-3 animate-spin shrink-0" aria-hidden />}
              <span>{statusMeta}</span>
            </div>
          </div>
          <Switch
            on={enabled}
            onToggle={handleToggle}
            ariaLabel={t('calendar.autoSync.toggleLabel')}
            disabled={toggleDisabled}
          />
        </div>
      </div>
      <SettingsDescription>{t('calendar.autoSync.description')}</SettingsDescription>

      {!isLoading && hasConnection && (
        <div className="flex justify-end" style={{ padding: '0 20px 6px' }}>
          <QuietActionButton onClick={handleSyncNow} disabled={runSyncNow.isPending}>
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
          </QuietActionButton>
        </div>
      )}

      {showReconnect && (
        <div
          style={{
            padding: '6px 20px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div className="flex items-start gap-2 text-[var(--status-overdue)]">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" aria-hidden />
            <div className="flex-1 min-w-0">
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                  fontWeight: 500,
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
          <QuietActionButton onClick={connectGoogle} tone="warning">
            {t('calendar.autoSync.reconnectCta')}
          </QuietActionButton>
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
        <CalendarDays
          className="size-12 mx-auto mb-4"
          strokeWidth={1.4}
          color="var(--fg-3)"
        />
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            color: 'var(--fg-2)',
          }}
        >
          {title}
        </p>
        <button
          type="button"
          className="inline-block mt-4 appearance-none border-0 bg-transparent cursor-pointer hover:opacity-80 transition-opacity duration-150"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            fontWeight: 500,
            minHeight: 44,
            color: 'var(--fg-2)',
          }}
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
        <div className="flex flex-col items-center justify-center gap-5 pt-12" role="status" aria-live="polite">
          <div
            className="flex items-center justify-center rounded-full"
            style={{
              width: 64,
              height: 64,
              background: 'rgba(var(--primary-rgb), 0.10)',
            }}
          >
            <LinkIcon className="size-7 text-[var(--primary)]" strokeWidth={1.8} />
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
          <PillButton onClick={connectGoogle}>
            {t('auth.signInWithGoogle')}
          </PillButton>
        </div>
      )}

      {step === 'select' && (
        <div style={{ paddingTop: 18 }}>
          {events.length === 0 ? (
            renderEmptyState()
          ) : (
            <>
              <div
                className="flex items-center justify-between"
                style={{ padding: '0 20px 6px' }}
              >
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 14,
                    color: 'var(--fg-2)',
                  }}
                >
                  {plural(t('calendar.eventsFound', { count: events.length }), events.length)}
                </p>
                <button
                  type="button"
                  className="appearance-none border-0 bg-transparent cursor-pointer hover:opacity-80 transition-opacity duration-150"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    fontWeight: 500,
                    minHeight: 44,
                    color: 'var(--fg-2)',
                  }}
                  onClick={toggleAll}
                  aria-pressed={allSelected}
                >
                  {allSelected ? t('calendar.deselectAll') : t('calendar.selectAll')}
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto">
                {events.map((event) => {
                  const suggestionId = isReviewMode ? findSuggestionIdForEvent(event.id) : null
                  const selected = selectedIds.has(event.id)
                  return (
                    <div
                      key={event.id}
                      className="flex items-start"
                      style={{
                        gap: 12,
                        padding: '0 20px',
                        borderBottom: '1px solid var(--hairline)',
                        background: selected
                          ? 'rgba(var(--primary-rgb), 0.06)'
                          : 'transparent',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleEvent(event.id)}
                        aria-pressed={selected}
                        className="flex-1 min-w-0 text-left flex items-start appearance-none border-0 bg-transparent cursor-pointer"
                        style={{ gap: 14, padding: '14px 0' }}
                      >
                        <span className="shrink-0" style={{ marginTop: 1 }}>
                          <RadioGlyph selected={selected} size={24} />
                        </span>
                        <span className="flex-1 min-w-0 block">
                          <span
                            className="block truncate"
                            style={{
                              fontFamily: 'var(--font-sans)',
                              fontSize: 15,
                              fontWeight: 500,
                              color: 'var(--fg-1)',
                            }}
                          >
                            {event.title}
                          </span>
                          <span
                            className="flex flex-wrap items-center"
                            style={{ gap: 8, marginTop: 3 }}
                          >
                            {event.startDate && (
                              <span
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: 12,
                                  color: 'var(--fg-3)',
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                {event.startDate}
                              </span>
                            )}
                            {event.startTime && (
                              <span
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: 12,
                                  color: 'var(--fg-3)',
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                {event.startTime}{event.endTime ? ` - ${event.endTime}` : ''}
                              </span>
                            )}
                            {event.isRecurring && (
                              <Badge tone="soft">
                                {formatCalendarSyncRecurrenceLabel(event.recurrenceRule, {
                                  translate: (key, values) => t(key as never, values as never),
                                  pluralize: plural,
                                }) || t('calendar.recurring')}
                              </Badge>
                            )}
                            {event.reminders.length > 0 && (
                              <span
                                className="inline-flex items-center"
                                style={{
                                  gap: 3,
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: 12,
                                  color: 'var(--fg-3)',
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                <Bell className="size-3" aria-hidden />
                                {event.reminders.length}
                              </span>
                            )}
                          </span>
                          {event.description && (
                            <span
                              className="block line-clamp-1"
                              style={{
                                fontFamily: 'var(--font-sans)',
                                fontSize: 13,
                                color: 'var(--fg-3)',
                                marginTop: 3,
                              }}
                            >
                              {event.description}
                            </span>
                          )}
                        </span>
                      </button>

                      {isReviewMode && suggestionId && (
                        <button
                          type="button"
                          onClick={() => handleDismissSuggestion(suggestionId)}
                          disabled={dismissSuggestion.isPending}
                          aria-label={t('calendar.autoSync.dismissSuggestion')}
                          className="shrink-0 appearance-none border-0 bg-transparent cursor-pointer rounded-full text-[var(--fg-4)] hover:text-[var(--status-bad)] transition-colors duration-150 disabled:opacity-50"
                          style={{ padding: 10, marginTop: 6 }}
                        >
                          <X className="size-4" aria-hidden />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              <div style={{ padding: '18px 20px 0' }}>
                <PillButton
                  fullWidth
                  disabled={selectedIds.size === 0}
                  onClick={importSelected}
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
              {plural(t('calendar.importedCount', { count: importResult?.imported ?? 0 }), importResult?.imported ?? 0)}
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full transition-[background-color] duration-150"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 16,
              fontWeight: 500,
              padding: '15px 26px',
              background: 'var(--primary)',
              color: 'var(--fg-on-primary)',
              boxShadow: 'var(--primary-glow)',
            }}
          >
            {t('calendar.goToHabits')}
          </Link>
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
  )
}
