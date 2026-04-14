import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  Link,
  Loader2,
  RefreshCw,
} from 'lucide-react-native'
import { API } from '@orbit/shared/api'
import { calendarKeys } from '@orbit/shared/query'
import {
  buildCalendarAutoSyncImportRequest,
  buildCalendarSyncImportRequest,
  formatCalendarAutoSyncLastSynced,
  formatCalendarSyncRecurrenceLabel,
  isCalendarAutoSyncStatusReconnectRequired,
  isCalendarSyncNotConnectedMessage,
  type CalendarSyncEvent,
} from '@orbit/shared/utils'
import { getErrorMessage } from '@orbit/shared/utils/error-utils'
import { useQueryClient } from '@tanstack/react-query'
import { useProfile } from '@/hooks/use-profile'
import { useBulkCreateHabits } from '@/hooks/use-habits'
import {
  useCalendarAutoSyncState,
  useCalendarSyncSuggestions,
  useRunCalendarSyncNow,
  useSetCalendarAutoSync,
} from '@/hooks/use-calendar-auto-sync'
import { apiClient } from '@/lib/api-client'
import { radius, shadows } from '@/lib/theme'
import { plural } from '@/lib/plural'
import { startMobileGoogleAuth } from '@/lib/google-auth'
import { useAppTheme } from '@/lib/use-app-theme'
import { useOffline } from '@/hooks/use-offline'
import { useAppToast } from '@/hooks/use-app-toast'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'

type Step = 'loading' | 'select' | 'importing' | 'done' | 'error' | 'not-connected' | 'offline'

type CalendarEvent = CalendarSyncEvent

interface ImportResult {
  imported: number
  habits: { id: string; title: string }[]
}

async function fetchCalendarEvents(): Promise<CalendarEvent[]> {
  try {
    const data = await apiClient<CalendarEvent[]>(API.calendar.events)
    return Array.isArray(data) ? data : []
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : ''
    if (message === 'Unauthorized' || isCalendarSyncNotConnectedMessage(message)) {
      throw new Error('__NOT_CONNECTED__')
    }

    throw err
  }
}

export default function CalendarSyncScreen() {
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const params = useLocalSearchParams<{ mode?: string }>()
  const isReviewMode = params.mode === 'review'
  const { t } = useTranslation()
  const { profile, isLoading: isProfileLoading } = useProfile()
  const { colors } = useAppTheme()
  const { isOnline } = useOffline()
  const styles = useMemo(() => createStyles(colors), [colors])
  const bulkCreateHabits = useBulkCreateHabits()
  const queryClient = useQueryClient()
  const { showError } = useAppToast()

  const autoSyncStateQuery = useCalendarAutoSyncState()
  const suggestionsQuery = useCalendarSyncSuggestions()
  const setAutoSyncMutation = useSetCalendarAutoSync()
  const runSyncNowMutation = useRunCalendarSyncNow()

  const autoSyncState = autoSyncStateQuery.data
  const suggestions = useMemo(
    () => suggestionsQuery.data ?? [],
    [suggestionsQuery.data],
  )

  const [step, setStep] = useState<Step>('loading')
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [errorMessage, setErrorMessage] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const fetchErrorText = t('calendar.fetchError')

  const allSelected = events.length > 0 && selectedIds.size === events.length

  const selectedEvents = useMemo(
    () => events.filter((event) => selectedIds.has(event.id)),
    [events, selectedIds],
  )

  const selectedCount = selectedIds.size

  const fetchManualEvents = useCallback(async () => {
    if (!isOnline) {
      setStep('offline')
      return
    }

    setStep('loading')
    setErrorMessage('')

    try {
      const nextEvents = await fetchCalendarEvents()
      setEvents(nextEvents)
      setSelectedIds(new Set(nextEvents.map((event) => event.id)))
      setStep('select')
    } catch (err: unknown) {
      if (err instanceof Error && err.message === '__NOT_CONNECTED__') {
        setStep('not-connected')
        return
      }

      setErrorMessage(getErrorMessage(err, fetchErrorText))
      setStep('error')
    }
  }, [fetchErrorText, isOnline])

  useFocusEffect(
    useCallback(() => {
      if (!profile) return

      if (!profile.hasProAccess) {
        router.replace('/upgrade')
        return
      }
      if (!isOnline) {
        setStep('offline')
        return
      }

      void queryClient.invalidateQueries({ queryKey: calendarKeys.autoSyncState() })
      if (isReviewMode) {
        void queryClient.invalidateQueries({ queryKey: calendarKeys.syncSuggestions() })
        return
      }

      void fetchManualEvents()
    }, [
      fetchManualEvents,
      isOnline,
      isReviewMode,
      profile?.hasProAccess,
      queryClient,
      router,
    ]),
  )

  useEffect(() => {
    if (!isReviewMode) return
    if (!isOnline) {
      setStep('offline')
      return
    }
    if (suggestionsQuery.isLoading) {
      setStep('loading')
      return
    }
    if (suggestionsQuery.isError) {
      setErrorMessage(getErrorMessage(suggestionsQuery.error, fetchErrorText))
      setStep('error')
      return
    }

    const nextEvents: CalendarEvent[] = suggestions.map((suggestion) => suggestion.event)
    setEvents(nextEvents)
    setSelectedIds((prev) => {
      if (prev.size === 0) {
        return new Set(nextEvents.map((event) => event.id))
      }

      const next = new Set<string>()
      for (const event of nextEvents) {
        if (prev.has(event.id)) {
          next.add(event.id)
        }
      }
      return next
    })
    setStep('select')
  }, [
    isOnline,
    isReviewMode,
    suggestions,
    suggestionsQuery.error,
    suggestionsQuery.isError,
    suggestionsQuery.isLoading,
    fetchErrorText,
  ])

  const handleBack = useCallback(() => {
    goBackOrFallback('/profile')
  }, [goBackOrFallback])

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (allSelected) return new Set()
      return new Set(events.map((event) => event.id))
    })
  }, [allSelected, events])

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
  }, [])

  const handleConnect = useCallback(async () => {
    if (!isOnline) {
      setStep('offline')
      return
    }

    if (isConnecting) return

    setIsConnecting(true)
    setErrorMessage('')

    try {
      const result = await startMobileGoogleAuth({
        returnUrl: isReviewMode ? '/calendar-sync?mode=review' : '/calendar-sync',
      })

      if (result.type !== 'success') return

      router.replace('/auth-callback')
    } catch {
      setErrorMessage(t('auth.googleError'))
    } finally {
      setIsConnecting(false)
    }
  }, [isConnecting, isOnline, isReviewMode, router, t])

  const handleToggleAutoSync = useCallback(
    (enabled: boolean) => {
      if (!isOnline) {
        showError(t('calendarSync.notConnected'))
        return
      }

      setAutoSyncMutation.mutate({ enabled }, {
        onError: (err: unknown) => {
          showError(getErrorMessage(err, t('calendar.autoSync.syncFailed')))
        },
      })
    },
    [isOnline, setAutoSyncMutation, showError, t],
  )

  const handleSyncNow = useCallback(() => {
    if (!isOnline) {
      showError(t('calendarSync.notConnected'))
      return
    }

    runSyncNowMutation.mutate(undefined, {
      onError: (err: unknown) => {
        showError(getErrorMessage(err, t('calendar.autoSync.syncFailed')))
      },
    })
  }, [isOnline, runSyncNowMutation, showError, t])

  const handleImportSelected = useCallback(async () => {
    if (!isOnline) {
      setStep('offline')
      return
    }

    if (selectedCount === 0) return

    setStep('importing')
    setErrorMessage('')

    try {
      const request = isReviewMode
        ? buildCalendarAutoSyncImportRequest(
            suggestions.filter((suggestion) => selectedIds.has(suggestion.event.id)),
          )
        : buildCalendarSyncImportRequest(selectedEvents)
      const result = await bulkCreateHabits.mutateAsync(request)

      const successCount = result.results.filter((item) => item.status === 'Success').length
      const failedItems = result.results.filter((item) => item.status !== 'Success')

      if (failedItems.length > 0 && successCount === 0) {
        setErrorMessage(
          failedItems
            .map((item) => `${item.title ?? t('common.unknown')}: ${item.error ?? t('common.failed')}`)
            .join(', '),
        )
        setStep('error')
        return
      }

      setImportResult({
        imported: successCount,
        habits: result.results
          .filter((item) => item.status === 'Success' && item.habitId && item.title)
          .map((item) => ({ id: item.habitId as string, title: item.title as string })),
      })
      setStep('done')

      if (isReviewMode) {
        void queryClient.invalidateQueries({ queryKey: calendarKeys.syncSuggestions() })
      }
    } catch (err: unknown) {
      setErrorMessage(getErrorMessage(err, t('calendar.importError')))
      setStep('error')
    }
  }, [
    bulkCreateHabits,
    isOnline,
    isReviewMode,
    queryClient,
    selectedCount,
    selectedEvents,
    selectedIds,
    suggestions,
    t,
  ])

  const handleRetry = useCallback(() => {
    if (!isOnline) {
      setStep('offline')
      return
    }

    if (isReviewMode) {
      setStep('loading')
      setErrorMessage('')
      void queryClient.invalidateQueries({ queryKey: calendarKeys.syncSuggestions() })
      return
    }

    void fetchManualEvents()
  }, [fetchManualEvents, isOnline, isReviewMode, queryClient])

  const renderEventCard = (event: CalendarEvent) => {
    const selected = selectedIds.has(event.id)
    const recurrenceLabel = formatCalendarSyncRecurrenceLabel(event.recurrenceRule, {
      translate: (key, values) => t(key, values),
      pluralize: plural,
    })
    const dateLabel = event.startDate ?? ''
    const timeLabel = event.startTime
      ? `${event.startTime}${event.endTime ? ` - ${event.endTime}` : ''}`
      : ''

    return (
      <TouchableOpacity
        key={event.id}
        style={[
          styles.eventCard,
          selected ? styles.eventCardSelected : styles.eventCardUnselected,
        ]}
        onPress={() => toggleEvent(event.id)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityState={{ selected }}
      >
        <View style={styles.eventRow}>
          <View style={[styles.checkbox, selected ? styles.checkboxSelected : styles.checkboxUnselected]}>
            {selected && <Check size={12} color={colors.white} />}
          </View>

          <View style={styles.eventContent}>
            <View style={styles.eventTitleRow}>
              <Text style={styles.eventTitle} numberOfLines={1}>
                {event.title}
              </Text>
              {event.isRecurring && (
                <View style={styles.pill}>
                  <Text style={styles.pillText}>
                    {recurrenceLabel || t('calendar.recurring')}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.metaRow}>
              {dateLabel ? <Text style={styles.metaText}>{dateLabel}</Text> : null}
              {timeLabel ? <Text style={styles.metaTextMuted}>{timeLabel}</Text> : null}
              {event.reminders.length > 0 ? (
                <View style={styles.reminderCount}>
                  <Bell size={11} color={colors.textMuted} />
                  <Text style={styles.reminderCountText}>{event.reminders.length}</Text>
                </View>
              ) : null}
            </View>

            {event.description ? (
              <Text style={styles.description} numberOfLines={1}>
                {event.description}
              </Text>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('common.goBack')}
          >
            <ArrowLeft size={18} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isReviewMode ? t('calendar.autoSync.reviewModeTitle') : t('calendar.title')}
          </Text>
        </View>

        {profile?.hasProAccess && !isProfileLoading && (
          <View style={styles.autoSyncCard}>
            <View style={styles.toggleHeader}>
              <View style={styles.autoSyncLabelGroup}>
                <Text style={styles.autoSyncTitle}>
                  {t('calendar.autoSync.title')}
                </Text>
                <Text style={styles.autoSyncDescription}>
                  {t('calendar.autoSync.description')}
                </Text>
              </View>
              <Switch
                value={autoSyncState?.enabled ?? false}
                onValueChange={handleToggleAutoSync}
                trackColor={{ false: colors.surfaceElevated, true: colors.primary }}
                thumbColor={colors.white}
                disabled={
                  !autoSyncState?.hasGoogleConnection ||
                  setAutoSyncMutation.isPending ||
                  autoSyncStateQuery.isLoading ||
                  !isOnline
                }
              />
            </View>

            {!autoSyncState?.hasGoogleConnection && (
              <Text style={styles.autoSyncHint}>
                {t('calendar.autoSync.connectGoogleFirst')}
              </Text>
            )}

            {autoSyncState?.hasGoogleConnection && (
              <View style={styles.autoSyncMetaRow}>
                <Text style={styles.autoSyncMetaText}>
                  {formatCalendarAutoSyncLastSynced(
                    autoSyncState.lastSyncedAt ?? null,
                    (key, values) => {
                      const raw = t(key, values)
                      const count = typeof values?.n === 'number' ? values.n : 1
                      return plural(raw, count)
                    },
                  )}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.syncNowButton,
                    (runSyncNowMutation.isPending || !isOnline) && styles.buttonDisabled,
                  ]}
                  onPress={handleSyncNow}
                  disabled={runSyncNowMutation.isPending || !isOnline}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t('calendar.autoSync.syncNow')}
                >
                  {runSyncNowMutation.isPending ? (
                    <ActivityIndicator size="small" color={colors.primary400} />
                  ) : (
                    <RefreshCw size={13} color={colors.primary400} />
                  )}
                  <Text style={styles.syncNowButtonText}>
                    {runSyncNowMutation.isPending
                      ? t('calendar.autoSync.syncNowRunning')
                      : t('calendar.autoSync.syncNow')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {isCalendarAutoSyncStatusReconnectRequired(autoSyncState?.status) && (
              <View style={styles.reconnectBanner}>
                <AlertTriangle size={16} color={colors.amber} />
                <View style={styles.reconnectBannerBody}>
                  <Text style={styles.reconnectBannerTitle}>
                    {t('calendar.autoSync.reconnectTitle')}
                  </Text>
                  <Text style={styles.reconnectBannerText}>
                    {t('calendar.autoSync.reconnectBody')}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.reconnectButton}
                  onPress={handleConnect}
                  disabled={isConnecting}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t('calendar.autoSync.reconnectCta')}
                >
                  <Text style={styles.reconnectButtonText}>
                    {t('calendar.autoSync.reconnectCta')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {(isProfileLoading || step === 'loading') && (
          <View style={styles.centerState} accessibilityLiveRegion="polite" accessibilityLabel={t('calendar.fetchingEvents')}>
            <View style={styles.stateIcon}>
              <Loader2 size={26} color={colors.primary400} />
            </View>
            <Text style={styles.stateTitle}>{t('calendar.fetchingEvents')}</Text>
          </View>
        )}

        {step === 'not-connected' && !isProfileLoading && (
          <View style={styles.centerState} accessibilityLiveRegion="polite" accessibilityLabel={t('calendar.notConnectedTitle')}>
            <View style={[styles.stateIcon, styles.stateIconPrimary]}>
              <Link size={26} color={colors.primary400} />
            </View>
            <Text style={styles.stateTitle}>{t('calendar.notConnectedTitle')}</Text>
            <Text style={styles.stateDescription}>{t('calendar.notConnectedDesc')}</Text>
            <TouchableOpacity
              style={[styles.primaryButton, isConnecting && styles.buttonDisabled]}
              onPress={handleConnect}
              disabled={isConnecting}
              activeOpacity={0.85}
            >
              {isConnecting ? (
                <ActivityIndicator color={colors.white} />
              ) : null}
              <Text style={styles.primaryButtonText}>{t('auth.signInWithGoogle')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'offline' && !isProfileLoading && (
          <View style={styles.centerState} accessibilityLiveRegion="polite" accessibilityLabel={t('calendarSync.notConnected')}>
            <OfflineUnavailableState
              title={t('calendarSync.notConnected')}
              description={`${t('calendarSync.connect')} / ${t('calendar.importButton', { count: 1 })}`}
              actionLabel={t('calendar.retry')}
              onAction={handleRetry}
              disabled={!isOnline}
            />
            <TouchableOpacity style={styles.secondaryButton} onPress={handleBack} activeOpacity={0.8}>
              <Text style={styles.secondaryButtonText}>{t('common.goBack')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'select' && (
          <View style={styles.contentStack}>
            {!isOnline && (
              <OfflineUnavailableState
                title={t('calendarSync.notConnected')}
                description={`${t('calendarSync.connect')} / ${t('calendar.importButton', { count: selectedCount || 1 })}`}
                compact
              />
            )}
            {events.length === 0 ? (
              <View
                style={styles.centerState}
                accessibilityLiveRegion="polite"
                accessibilityLabel={
                  isReviewMode ? t('calendar.autoSync.reviewModeEmpty') : t('calendar.noEvents')
                }
              >
                <View style={styles.stateIcon}>
                  <CalendarDays size={26} color={colors.textMuted} />
                </View>
                <Text style={styles.stateTitle}>
                  {isReviewMode
                    ? t('calendar.autoSync.reviewModeEmpty')
                    : t('calendar.noEvents')}
                </Text>
                <TouchableOpacity style={styles.secondaryButton} onPress={handleBack} activeOpacity={0.8}>
                  <Text style={styles.secondaryButtonText}>{t('common.goBack')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.selectionBar}>
                  <Text style={styles.selectionCount}>
                    {plural(t('calendar.eventsFound', { count: events.length }), events.length)}
                  </Text>
                  <TouchableOpacity onPress={toggleAll} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ selected: allSelected }}>
                    <Text style={styles.selectAllText}>
                      {allSelected ? t('calendar.deselectAll') : t('calendar.selectAll')}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.eventList}>
                  {events.map(renderEventCard)}
                </View>

                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    (selectedCount === 0 || !isOnline) && styles.buttonDisabled,
                  ]}
                  onPress={handleImportSelected}
                  disabled={selectedCount === 0 || !isOnline}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryButtonText}>
                    {plural(t('calendar.importButton', { count: selectedCount }), selectedCount)}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {step === 'importing' && (
          <View style={styles.centerState} accessibilityLiveRegion="polite" accessibilityLabel={t('calendar.importing')}>
            <View style={styles.stateIcon}>
              <ActivityIndicator color={colors.primary400} />
            </View>
            <Text style={styles.stateTitle}>{t('calendar.importing')}</Text>
          </View>
        )}

        {step === 'done' && (
          <View style={styles.centerState} accessibilityLiveRegion="polite" accessibilityLabel={t('calendar.importDone')}>
            <View style={[styles.stateIcon, styles.stateIconSuccess]}>
              <Check size={26} color={colors.green400} />
            </View>
            <Text style={styles.stateTitle}>{t('calendar.importDone')}</Text>
            <Text style={styles.stateDescription}>
              {plural(t('calendar.importedCount', { count: importResult?.imported ?? 0 }), importResult?.imported ?? 0)}
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.replace('/')}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>{t('calendar.goToHabits')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'error' && (
          <View style={styles.centerState} accessibilityRole="alert" accessibilityLiveRegion="assertive">
            <View style={[styles.stateIcon, styles.stateIconError]}>
              <AlertTriangle size={26} color={colors.red400} />
            </View>
            <Text style={styles.stateTitle}>{t('calendar.errorTitle')}</Text>
            <Text style={styles.stateDescription}>{errorMessage}</Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.primaryButton} onPress={handleRetry} activeOpacity={0.85}>
                <Text style={styles.primaryButtonText}>{t('calendar.retry')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleBack} activeOpacity={0.8}>
                <Text style={styles.secondaryButtonText}>{t('common.goBack')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingTop: 20,
    paddingBottom: 20,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    ...shadows.sm,
    elevation: 2,
  },
  headerTitle: {
    flex: 1,
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.6,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 14,
  },
  stateIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    ...shadows.sm,
    elevation: 2,
  },
  stateIconPrimary: {
    backgroundColor: colors.primary_10,
    borderColor: colors.primary_20,
  },
  stateIconSuccess: {
    backgroundColor: 'rgba(52, 211, 153, 0.10)',
    borderColor: 'rgba(52, 211, 153, 0.20)',
  },
  stateIconError: {
    backgroundColor: colors.redBg,
    borderColor: colors.redBorder,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  stateDescription: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 360,
  },
  contentStack: {
    gap: 14,
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  selectionCount: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  selectAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary400,
  },
  eventList: {
    gap: 10,
  },
  eventCard: {
    borderRadius: radius.xl,
    padding: 16,
    borderWidth: 1,
  },
  eventCardSelected: {
    backgroundColor: colors.primary_10,
    borderColor: colors.primary_30,
  },
  eventCardUnselected: {
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxUnselected: {
    backgroundColor: 'transparent',
    borderColor: colors.borderEmphasis,
  },
  eventContent: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  eventTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  eventTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.primary_15,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: colors.primary400,
    textTransform: 'uppercase',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  metaTextMuted: {
    fontSize: 12,
    color: colors.textMuted,
  },
  reminderCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  reminderCountText: {
    fontSize: 10,
    color: colors.textMuted,
  },
  description: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: radius.xl,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.primary,
    ...shadows.lg,
    shadowColor: colors.primary,
    elevation: 5,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.white,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: radius.xl,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderEmphasis,
    backgroundColor: colors.surface,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  autoSyncCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    padding: 18,
    marginBottom: 16,
    gap: 12,
    ...shadows.sm,
    elevation: 2,
  },
  toggleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  autoSyncLabelGroup: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  autoSyncTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  autoSyncDescription: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  autoSyncHint: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  autoSyncMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  autoSyncMetaText: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
  syncNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.primary_10,
    borderWidth: 1,
    borderColor: colors.primary_20,
  },
  syncNowButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary400,
  },
  reconnectBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(251, 191, 36, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.30)',
  },
  reconnectBannerBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  reconnectBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  reconnectBannerText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  reconnectButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.amber,
  },
  reconnectButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.white,
  },
  })
}
