import { useCallback, useEffect, useImperativeHandle, useMemo, type Ref } from 'react'
import {
  Pressable,
  Text,
  View,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  Check,
  Link as LinkIcon,
  WifiOff,
} from '@/components/ui/icons'
import { calendarKeys } from '@orbit/shared/query'
import {
  buildCalendarAutoSyncImportRequest,
  buildCalendarSyncImportRequest,
  calendarImportEventsKey,
  isCalendarSyncEventImportable,
  isCalendarSyncConnectionActive,
  resolveCalendarImportConnectionStep,
  resolveCalendarImportEvents,
  resolveCalendarImportSelection,
  getFriendlyErrorMessage,
  type CalendarSyncEvent,
} from '@orbit/shared/utils'
import { useQueryClient } from '@tanstack/react-query'
import { useProfile } from '@/hooks/use-profile'
import { useBulkCreateHabits } from '@/hooks/use-habits'
import {
  useCalendarAutoSyncState,
  useCalendarSyncSuggestions,
  useDismissCalendarSuggestion,
} from '@/hooks/use-calendar-auto-sync'
import { useCalendarEvents } from '@/hooks/use-calendar-events'
import { plural } from '@/lib/plural'
import { startMobileGoogleAuth } from '@/lib/google-auth'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useAccountGeneration, useAccountScopedState } from '@/hooks/use-session-reset'
import { WebBrowserResultType } from 'expo-web-browser'
import { allowGoogleErrorLogin } from '@/lib/google-auth-callback'
import {
  resolveCalendarSyncStep,
  resolveDisplayedErrorMessage,
  type WizardStage,
} from '@/lib/calendar-sync-state'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useOffline } from '@/hooks/use-offline'
import { useAppToast } from '@/hooks/use-app-toast'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { PillButton } from '@/components/ui/pill-button'
import { CalendarPickerSection } from '@/components/calendar-sync/calendar-picker-section'
import { CalendarSyncEventRow } from '@/components/calendar-sync/calendar-sync-event-row'
import { SelectAllToggle } from '@/components/calendar-sync/calendar-sync-select-all-toggle'
import { createStyles } from './calendar-import-styles'

const EVENTS_PAGE_SIZE = 20

export interface CalendarImportActionHandle {
  importSelected: () => void
}

export interface CalendarImportActionState {
  count: number
  disabled: boolean
}

function rgbaFromHex(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

type CalendarEvent = CalendarSyncEvent

interface ImportResult {
  imported: number
  habits: { id: string; title: string }[]
}

// react-doctor-disable-next-line no-giant-component -- Screen orchestration is already decomposed into calendar-sync-* section components; the remaining wizard state + JSX tree is inherently long, and further splitting is a regression-prone refactor with cross-platform parity cost. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function CalendarImportContent({ reviewMode, initialEventId, onClose, onGoToHabits, actionRef, onActionStateChange }: Readonly<{ reviewMode: boolean; initialEventId: string | null; onClose: () => void; onGoToHabits: () => void; actionRef: Ref<CalendarImportActionHandle>; onActionStateChange: (state: CalendarImportActionState | null) => void }>) {
  const router = useRouter()
  const isReviewMode = reviewMode
  const { t } = useTranslation()
  const { profile, isLoading: isProfileLoading } = useProfile()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const { isOnline } = useOffline()
  const accountGeneration = useAccountGeneration()
  const styles = useMemo(() => createStyles(), [])
  const chipTint = useMemo(
    () => ({ backgroundColor: tokens.bgElev, borderColor: tokens.hairline }),
    [tokens],
  )
  const bulkCreateHabits = useBulkCreateHabits()
  const queryClient = useQueryClient()
  const { showError } = useAppToast()

  const hasProAccess = profile?.hasProAccess ?? false
  const weekStartDay = profile?.weekStartDay ?? 1

  const autoSyncStateQuery = useCalendarAutoSyncState({ enabled: hasProAccess })
  const suggestionsQuery = useCalendarSyncSuggestions({
    enabled: hasProAccess && isReviewMode,
  })
  const dismissSuggestion = useDismissCalendarSuggestion()

  const suggestions = useMemo(
    () => suggestionsQuery.data ?? [],
    [suggestionsQuery.data],
  )

  const [wizardStage, setWizardStage] = useAccountScopedState<WizardStage>('browse')
  const [events, setEvents] = useAccountScopedState<CalendarEvent[]>([])
  const [selectedIds, setSelectedIds] = useAccountScopedState<Set<string>>(() => initialEventId ? new Set([initialEventId]) : new Set())
  const [errorMessage, setErrorMessage] = useAccountScopedState('')
  const [importResult, setImportResult] = useAccountScopedState<ImportResult | null>(null)
  const [isConnecting, setIsConnecting] = useAccountScopedState(false)
  const [previousEventsKey, setPreviousEventsKey] = useAccountScopedState<string | null>(null)
  const [visibleCount, setVisibleCount] = useAccountScopedState(EVENTS_PAGE_SIZE)

  const eventsQuery = useCalendarEvents({
    enabled: hasProAccess && !isReviewMode && isOnline,
    timeZone: profile?.timeZone ?? null,
  })

  const incomingEvents = useMemo<CalendarEvent[]>(() => {
    return resolveCalendarImportEvents(isReviewMode, suggestions, eventsQuery.data)
  }, [isReviewMode, suggestions, eventsQuery.data])

  const eventsKey = calendarImportEventsKey(isReviewMode, weekStartDay, incomingEvents)
  if (eventsKey !== previousEventsKey) {
    setPreviousEventsKey(eventsKey)
    setEvents(incomingEvents)
    setVisibleCount(EVENTS_PAGE_SIZE)
    setSelectedIds(resolveCalendarImportSelection(
      initialEventId, isReviewMode, incomingEvents, weekStartDay, selectedIds, previousEventsKey,
    ))
  }

  const importableEvents = useMemo(
    () => events.filter((event) => isCalendarSyncEventImportable(event, weekStartDay)),
    [events, weekStartDay],
  )
  const allSelected =
    importableEvents.length > 0 && selectedIds.size === importableEvents.length

  const selectedEvents = useMemo(
    () => events.filter((event) => selectedIds.has(event.id)),
    [events, selectedIds],
  )

  const selectedCount = selectedIds.size

  useFocusEffect(
    useCallback(() => {
      if (!profile) return

      if (!profile.hasProAccess) {
        router.replace('/upgrade')
        return
      }
      if (!isOnline) {
        return
      }

      void queryClient.invalidateQueries({
        queryKey: calendarKeys.autoSyncState(),
      })
      if (isReviewMode) {
        void queryClient.invalidateQueries({
          queryKey: calendarKeys.syncSuggestions(),
        })
        return
      }

      void eventsQuery.refetch()
    }, [eventsQuery, isOnline, isReviewMode, profile, queryClient, router]),
  )

  const activeQuery = isReviewMode ? suggestionsQuery : eventsQuery
  const resolvedStep = resolveCalendarSyncStep({
    wizardStage,
    isProfileLoading,
    isOnline,
    isReviewMode,
    isQueryLoading: activeQuery.isLoading,
    isQueryError: activeQuery.isError,
    eventsStatus: eventsQuery.data?.status,
  })
  const googleConnected = isCalendarSyncConnectionActive(
    autoSyncStateQuery.data?.hasGoogleConnection ?? false,
    autoSyncStateQuery.data?.status ?? 'Idle',
  )
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

  const handleBack = onClose

  const toggleAll = useCallback(() => {
    setSelectedIds(() => {
      if (allSelected) return new Set()
      return new Set(importableEvents.map((event) => event.id))
    })
  }, [allSelected, importableEvents, setSelectedIds])

  const toggleEvent = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [setSelectedIds])

  const handleConnect = useCallback(async () => {
    if (!isOnline) {
      return
    }
    if (isConnecting) return

    setIsConnecting(true)
    setErrorMessage('')

    try {
      const result = await startMobileGoogleAuth({
        returnUrl: isReviewMode
          ? '/calendar?mode=review'
          : '/calendar?import=1',
        forceConsent: true,
      })
      if (result.type === WebBrowserResultType.CANCEL || result.type === WebBrowserResultType.DISMISS || result.type === 'denied') return
      if (result.type !== 'success') {
        allowGoogleErrorLogin()
        router.replace('/login?googleError=1')
        return
      }
    } catch {
      allowGoogleErrorLogin()
      router.replace('/login?googleError=1')
    } finally {
      setIsConnecting(false)
    }
  }, [isConnecting, isOnline, isReviewMode, router, setErrorMessage, setIsConnecting])

  const handleImportSelected = useCallback(async () => {
    if (!isOnline) {
      return
    }
    if (selectedIds.size === 0) return

    setWizardStage('importing')
    setErrorMessage('')

    try {
      const request = isReviewMode
        ? buildCalendarAutoSyncImportRequest(
            suggestions.filter((suggestion) =>
              selectedIds.has(suggestion.event.id),
            ),
            weekStartDay,
          )
        : buildCalendarSyncImportRequest(selectedEvents, weekStartDay)
      const result = await bulkCreateHabits.mutateAsync(request)

      const successCount = result.results.filter(
        (item) => item.status === 'Success',
      ).length
      const failedItems = result.results.filter(
        (item) => item.status !== 'Success',
      )

      if (failedItems.length > 0 && successCount === 0) {
        setErrorMessage(
          failedItems
            .map(
              (item) =>
                `${item.title ?? t('common.unknown')}: ${item.error ?? t('common.failed')}`,
            )
            .join(', '),
        )
        setWizardStage('error')
        return
      }

      if (failedItems.length > 0) {
        showError(
          plural(
            t('calendar.importPartialFailure', { count: failedItems.length }),
            failedItems.length,
          ),
        )
      }

      const habits: { id: string; title: string }[] = []
      for (const item of result.results) {
        if (item.status === 'Success' && item.habitId && item.title) {
          habits.push({ id: item.habitId, title: item.title })
        }
      }
      setImportResult({ imported: successCount, habits })
      setWizardStage('done')

      void queryClient.invalidateQueries({ queryKey: [...calendarKeys.all, 'manual-fetch'] })
      if (isReviewMode) {
        void queryClient.invalidateQueries({
          queryKey: calendarKeys.syncSuggestions(),
        })
      }
    } catch (err: unknown) {
      setErrorMessage(getFriendlyErrorMessage(err, t, 'calendar.importError', 'generic'))
      setWizardStage('error')
    }
  }, [
    bulkCreateHabits,
    isOnline,
    isReviewMode,
    queryClient,
    selectedEvents,
    selectedIds,
    setErrorMessage,
    setImportResult,
    setWizardStage,
    showError,
    suggestions,
    t,
    weekStartDay,
  ])

  useImperativeHandle(actionRef, () => ({ importSelected: () => void handleImportSelected() }), [handleImportSelected])
  useEffect(() => {
    onActionStateChange(step === 'select' && events.length > 0
      ? { count: selectedCount, disabled: selectedCount === 0 || !isOnline }
      : null)
  }, [step, events.length, selectedCount, isOnline, accountGeneration, onActionStateChange])
  useEffect(() => () => onActionStateChange(null), [onActionStateChange])

  const handleRetry = useCallback(() => {
    if (!isOnline) {
      return
    }
    setWizardStage('browse')
    setErrorMessage('')
    if (autoSyncStateQuery.isError) {
      void autoSyncStateQuery.refetch()
      return
    }
    if (isReviewMode) {
      void queryClient.invalidateQueries({
        queryKey: calendarKeys.syncSuggestions(),
      })
      return
    }
    void eventsQuery.refetch()
  }, [autoSyncStateQuery, eventsQuery, isOnline, isReviewMode, queryClient, setErrorMessage, setWizardStage])

  const handleDismissSuggestion = useCallback(
    async (suggestionId: string) => {
      const requestAccount = getAccountGeneration()
      try {
        await dismissSuggestion.mutateAsync({ id: suggestionId })
      } catch (err: unknown) {
        if (getAccountGeneration() !== requestAccount) return
        showError(getFriendlyErrorMessage(err, t, 'calendar.autoSync.syncFailed', 'textless'))
      }
    },
    [dismissSuggestion, showError, t],
  )

  const findSuggestionIdForEvent = useCallback(
    (eventId: string): string | null => {
      const match = suggestions.find((suggestion) => suggestion.event.id === eventId)
      return match?.id ?? null
    },
    [suggestions],
  )

  return (
    <View>
      <CalendarPickerSection
        styles={styles}
        tokens={tokens}
        t={t}
        enabled={googleConnected && isOnline}
      />
        {(isProfileLoading || step === 'loading') && (
          <View
            style={styles.centerBlock}
            accessibilityLiveRegion="polite"
          >
            <Skeleton variant="settings" rows={2} label={t('calendar.fetchingEvents')} />
          </View>
        )}

        {step === 'not-connected' && !isProfileLoading && (
          <View
            style={styles.centerBlock}
            accessibilityLiveRegion="polite"
            accessibilityLabel={t('calendar.notConnectedTitle')}
          >
            <View
              style={[styles.stateGlyphCircle, { backgroundColor: tokens.bgWell }]}
            >
              <LinkIcon size={24} color={tokens.fg1} strokeWidth={1.8} />
            </View>
            <Text style={[styles.stateTitle, { color: tokens.fg1 }]}>
              {t('calendar.notConnectedTitle')}
            </Text>
            <Text style={[styles.stateText, { color: tokens.fg3 }]}>
              {t('calendar.notConnectedDesc')}
            </Text>
            {/* eslint-disable-next-line local/max-button-words -- Google's approved sign-in wording is required. */}
            <PillButton
              onClick={() => {
                void handleConnect()
              }}
              disabled={isConnecting}
            >
              {t('auth.signInWithGoogle')}
            </PillButton>
          </View>
        )}

        {step === 'offline' && !isProfileLoading && (
          <View
            style={styles.centerBlock}
            accessibilityLiveRegion="polite"
            accessibilityLabel={t('offline.title')}
          >
            <WifiOff size={24} color={tokens.fg3} strokeWidth={1.4} />
            <Text style={[styles.stateTitle, { color: tokens.fg1 }]}>
              {t('offline.title')}
            </Text>
            <Text style={[styles.stateText, { color: tokens.fg3 }]}>
              {t('offline.description')}
            </Text>
          </View>
        )}

        {step === 'select' && (
          <>
            {events.length === 0 ? (
              <EmptyState
                title={
                  isReviewMode
                    ? t('calendar.autoSync.reviewModeEmpty')
                    : t('calendar.noEvents')
                }
                action={
                  <PillButton variant="ghost" onClick={handleBack}>
                    {t('common.goBack')}
                  </PillButton>
                }
              />
            ) : (
              <>
                <View testID="section-heading-row" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <SectionLabel>{plural(t('calendar.eventsFound', { count: events.length }), events.length)}</SectionLabel>
                  </View>
                  <View style={{ flexShrink: 0, alignItems: 'center', paddingTop: 24, paddingRight: 16, paddingBottom: 12 }}>
                    <SelectAllToggle
                      allSelected={allSelected}
                      onToggle={toggleAll}
                      selectAllLabel={t('calendar.selectAll')}
                      deselectAllLabel={t('calendar.deselectAll')}
                      disabled={importableEvents.length === 0}
                      tokens={tokens}
                      tintStyle={chipTint}
                    />
                  </View>
                </View>
                {events.slice(0, visibleCount).map((event) => (
                  <CalendarSyncEventRow
                    key={event.id}
                    event={event}
                    weekStartDay={weekStartDay}
                    selected={selectedIds.has(event.id)}
                    isReviewMode={isReviewMode}
                    suggestionId={isReviewMode ? findSuggestionIdForEvent(event.id) : null}
                    dismissPending={dismissSuggestion.isPending}
                    styles={styles}
                    tokens={tokens}
                    t={t}
                    onToggle={toggleEvent}
                    onDismiss={(suggestionId) => void handleDismissSuggestion(suggestionId)}
                  />
                ))}
                {events.length > visibleCount ? (
                  <View style={styles.showMoreRow}>
                    <Pressable
                      onPress={() =>
                        setVisibleCount((count) =>
                          Math.min(count + EVENTS_PAGE_SIZE, events.length),
                        )
                      }
                      accessibilityRole="button"

                      style={({ pressed }) => [
                        styles.quietAction,
                        chipTint,
                        pressed && styles.quietActionDim,
                      ]}
                    >
                      <Text style={[styles.quietActionText, { color: tokens.fg2 }]}>
                        {t('calendar.showMore')}
                      </Text>
                    </Pressable>
                    <Text style={[styles.showingCountText, { color: tokens.fg3 }]}>
                      {t('calendar.showingCount', {
                        shown: Math.min(visibleCount, events.length),
                        total: events.length,
                      })}
                    </Text>
                  </View>
                ) : null}
              </>
            )}
          </>
        )}

        {step === 'importing' && (
          <View
            style={styles.centerBlock}
            accessibilityLiveRegion="polite"
          >
            <Skeleton variant="settings" rows={2} label={t('calendar.importing')} />
          </View>
        )}

        {step === 'done' && (
          <>
            <View style={styles.centerBlock}>
              <View
                style={[
                  styles.stateGlyphCircle,
                  { backgroundColor: tokens.bgWell },
                ]}
              >
                <Check size={24} color={tokens.fg1} strokeWidth={2.2} />
              </View>
              <Text style={[styles.stateTitle, { color: tokens.fg1 }]}>
                {t('calendar.importDone')}
              </Text>
            </View>
            <SectionLabel>
              {plural(
                t('calendar.importedCount', { count: importedCount }),
                importedCount,
              )}
            </SectionLabel>
            {importResult?.habits.map((habit) => (
              <SettingsRow key={habit.id} label={habit.title} accessory="none" />
            ))}
            <View style={styles.actionPad}>
              <PillButton onClick={onGoToHabits}>
                {t('calendar.goToHabits')}
              </PillButton>
            </View>
          </>
        )}

        {step === 'error' && (
          <View
            style={styles.centerBlock}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            <View
              style={[
                styles.stateGlyphCircle,
                { backgroundColor: rgbaFromHex(tokens.statusBad, 0.15) },
              ]}
            >
              <AlertTriangle size={24} color={tokens.statusBad} strokeWidth={1.8} />
            </View>
            <Text style={[styles.stateTitle, { color: tokens.fg1 }]}>
              {t('calendar.errorTitle')}
            </Text>
            <Text style={[styles.stateText, { color: tokens.fg2 }]}>
              {autoSyncStateQuery.isError ? t('calendar.fetchError') : displayedErrorMessage}
            </Text>
            <View style={styles.errorActions}>
              <PillButton onClick={handleRetry}>{t('calendar.retry')}</PillButton>
              <PillButton variant="ghost" onClick={handleBack}>
                {t('common.goBack')}
              </PillButton>
            </View>
          </View>
        )}

    </View>
  )
}
