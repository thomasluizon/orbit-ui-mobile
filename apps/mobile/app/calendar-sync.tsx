import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { CalendarDays, RefreshCw, WifiOff } from 'lucide-react-native'
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
import { plural } from '@/lib/plural'
import { startMobileGoogleAuth } from '@/lib/google-auth'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useOffline } from '@/hooks/use-offline'
import { useAppToast } from '@/hooks/use-app-toast'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsDescription } from '@/components/ui/settings-description'
import { SettingsRow, Switch } from '@/components/ui/settings-row'
import { SelectCheck } from '@/components/ui/select-check'
import { PillButton } from '@/components/ui/pill-button'

type Step =
  | 'loading'
  | 'select'
  | 'importing'
  | 'done'
  | 'error'
  | 'not-connected'
  | 'offline'

function rowEntrance(index: number) {
  return FadeInDown.duration(280)
    .delay(Math.min(index, 8) * 40)
    .reduceMotion(ReduceMotion.System)
}

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
    if (
      message === 'Unauthorized' ||
      isCalendarSyncNotConnectedMessage(message)
    ) {
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
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const { isOnline } = useOffline()
  const styles = useMemo(() => createStyles(), [])
  const chipTint = useMemo(
    () => ({ backgroundColor: tokens.bgElev, borderColor: tokens.hairline }),
    [tokens],
  )
  const bulkCreateHabits = useBulkCreateHabits()
  const queryClient = useQueryClient()
  const { showError } = useAppToast()

  const autoSyncStateQuery = useCalendarAutoSyncState({
    enabled: profile?.hasProAccess ?? false,
  })
  const suggestionsQuery = useCalendarSyncSuggestions({
    enabled: (profile?.hasProAccess ?? false) && isReviewMode,
  })
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

      void queryClient.invalidateQueries({
        queryKey: calendarKeys.autoSyncState(),
      })
      if (isReviewMode) {
        void queryClient.invalidateQueries({
          queryKey: calendarKeys.syncSuggestions(),
        })
        return
      }

      void fetchManualEvents()
    }, [fetchManualEvents, isOnline, isReviewMode, profile, queryClient, router]),
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

    const nextEvents: CalendarEvent[] = suggestions.map(
      (suggestion) => suggestion.event,
    )
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
    setSelectedIds(() => {
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
        returnUrl: isReviewMode
          ? '/calendar-sync?mode=review'
          : '/calendar-sync',
        forceConsent: true,
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
      setAutoSyncMutation.mutate(
        { enabled },
        {
          onError: (err: unknown) => {
            showError(getErrorMessage(err, t('calendar.autoSync.syncFailed')))
          },
        },
      )
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
            suggestions.filter((suggestion) =>
              selectedIds.has(suggestion.event.id),
            ),
          )
        : buildCalendarSyncImportRequest(selectedEvents)
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
        setStep('error')
        return
      }

      setImportResult({
        imported: successCount,
        habits: result.results
          .filter(
            (item) => item.status === 'Success' && item.habitId && item.title,
          )
          .map((item) => ({
            id: item.habitId as string,
            title: item.title as string,
          })),
      })
      setStep('done')

      if (isReviewMode) {
        void queryClient.invalidateQueries({
          queryKey: calendarKeys.syncSuggestions(),
        })
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
      void queryClient.invalidateQueries({
        queryKey: calendarKeys.syncSuggestions(),
      })
      return
    }
    void fetchManualEvents()
  }, [fetchManualEvents, isOnline, isReviewMode, queryClient])

  function renderEventRow(event: CalendarEvent, index: number) {
    const selected = selectedIds.has(event.id)
    const recurrenceLabel = formatCalendarSyncRecurrenceLabel(
      event.recurrenceRule,
      {
        translate: (key, values) => t(key, values),
        pluralize: plural,
      },
    )
    const dateLabel = event.startDate ?? ''
    const timeLabel = event.startTime
      ? `${event.startTime}${event.endTime ? `-${event.endTime}` : ''}`
      : ''
    const meta = [dateLabel, timeLabel, event.isRecurring ? recurrenceLabel : null]
      .filter(Boolean)
      .join(' · ')

    return (
      <Animated.View key={event.id} entering={rowEntrance(index)}>
        <Pressable
          onPress={() => toggleEvent(event.id)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
          style={({ pressed }) => [
            styles.eventRow,
            {
              borderBottomColor: tokens.hairline,
              backgroundColor: pressed
                ? tokens.bgElev
                : selected
                  ? tintFromPrimary(tokens, 0.06)
                  : 'transparent',
            },
          ]}
        >
          <View style={styles.eventBody}>
            <Text style={[styles.eventTitle, { color: tokens.fg1 }]} numberOfLines={1}>
              {event.title}
            </Text>
            {meta ? (
              <Text style={[styles.eventMeta, { color: tokens.fg3 }]} numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
          </View>
          <SelectCheck selected={selected} onPress={() => toggleEvent(event.id)} />
        </Pressable>
      </Animated.View>
    )
  }

  const hasConnection = autoSyncState?.hasGoogleConnection === true
  const lastSyncedLabel = formatCalendarAutoSyncLastSynced(
    autoSyncState?.lastSyncedAt ?? null,
    (key, values) => t(key, values),
  )
  const connectionMeta = (() => {
    if (autoSyncStateQuery.isLoading) return t('calendar.fetchingEvents')
    if (!hasConnection) return t('calendar.autoSync.connectGoogleFirst')
    return lastSyncedLabel
  })()

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: tokens.bg }]}
      edges={['top']}
    >
      <AppBar
        back
        onBack={handleBack}
        title={isReviewMode ? t('calendar.autoSync.reviewModeTitle') : t('calendar.title')}
        backLabel={t('common.goBack')}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {profile?.hasProAccess && !isProfileLoading ? (
          <>
            <SectionLabel bottom={10}>{t('calendar.autoSync.title')}</SectionLabel>
            <View style={styles.cardPad}>
              <View
                style={[
                  styles.connectionCard,
                  {
                    backgroundColor: tokens.bgCard,
                    borderColor: tokens.hairline,
                  },
                ]}
              >
                <View style={styles.connectionIconSlot}>
                  <CalendarDays size={22} color={tokens.fg1} strokeWidth={1.8} />
                </View>
                <View style={styles.connectionBody}>
                  <Text style={[styles.connectionTitle, { color: tokens.fg1 }]}>
                    Google Calendar
                  </Text>
                  <Text
                    style={[styles.connectionMeta, { color: tokens.fg3 }]}
                    numberOfLines={2}
                  >
                    {connectionMeta}
                  </Text>
                </View>
                <Switch
                  on={autoSyncState?.enabled ?? false}
                  onToggle={() =>
                    handleToggleAutoSync(!(autoSyncState?.enabled ?? false))
                  }
                  disabled={
                    !hasConnection ||
                    setAutoSyncMutation.isPending ||
                    autoSyncStateQuery.isLoading ||
                    !isOnline
                  }
                  accessibilityLabel={t('calendar.autoSync.title')}
                />
              </View>
            </View>
            <SettingsDescription>{t('calendar.autoSync.description')}</SettingsDescription>
            {hasConnection ? (
              <View style={styles.syncNowRow}>
                <Pressable
                  onPress={handleSyncNow}
                  disabled={runSyncNowMutation.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={t('calendar.autoSync.syncNow')}
                  style={({ pressed }) => [
                    styles.quietAction,
                    chipTint,
                    (pressed || runSyncNowMutation.isPending) && styles.quietActionDim,
                  ]}
                >
                  <RefreshCw size={13} color={tokens.fg2} strokeWidth={2} />
                  <Text style={[styles.quietActionText, { color: tokens.fg2 }]}>
                    {runSyncNowMutation.isPending
                      ? t('calendar.autoSync.syncNowRunning')
                      : t('calendar.autoSync.syncNow')}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {isCalendarAutoSyncStatusReconnectRequired(autoSyncState?.status) ? (
              <View style={styles.reconnectBlock}>
                <Text
                  style={[styles.stateText, { color: tokens.statusOverdue }]}
                >
                  {t('calendar.autoSync.reconnectBody')}
                </Text>
                <Pressable
                  onPress={handleConnect}
                  disabled={isConnecting}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.quietAction,
                    chipTint,
                    (pressed || isConnecting) && styles.quietActionDim,
                  ]}
                >
                  <Text
                    style={[styles.quietActionText, { color: tokens.statusOverdue }]}
                  >
                    {t('calendar.autoSync.reconnectCta')}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : null}

        {(isProfileLoading || step === 'loading') && (
          <View
            style={styles.centerBlock}
            accessibilityLiveRegion="polite"
            accessibilityLabel={t('calendar.fetchingEvents')}
          >
            <Text style={[styles.stateText, { color: tokens.fg3 }]}>
              {t('calendar.fetchingEvents')}
            </Text>
          </View>
        )}

        {step === 'not-connected' && !isProfileLoading && (
          <View
            style={styles.centerBlock}
            accessibilityLiveRegion="polite"
            accessibilityLabel={t('calendar.notConnectedTitle')}
          >
            <Text style={[styles.stateText, { color: tokens.fg3 }]}>
              {t('calendar.notConnectedDesc')}
            </Text>
            <PillButton
              onPress={() => {
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
            accessibilityLabel={t('calendarSync.notConnected')}
          >
            <WifiOff size={28} color={tokens.fg3} strokeWidth={1.4} />
            <Text style={[styles.stateText, { color: tokens.fg2 }]}>
              {t('calendarSync.notConnected')}
            </Text>
            <Pressable
              onPress={handleRetry}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.quietAction,
                chipTint,
                pressed && styles.quietActionDim,
              ]}
            >
              <Text style={[styles.quietActionText, { color: tokens.fg2 }]}>
                {t('calendar.retry')}
              </Text>
            </Pressable>
          </View>
        )}

        {step === 'select' && (
          <>
            {events.length === 0 ? (
              <View style={styles.centerBlock}>
                <Text style={[styles.stateText, { color: tokens.fg3 }]}>
                  {isReviewMode
                    ? t('calendar.autoSync.reviewModeEmpty')
                    : t('calendar.noEvents')}
                </Text>
              </View>
            ) : (
              <>
                <SectionLabel
                  trailing={
                    <Pressable
                      onPress={toggleAll}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.quietAction,
                        chipTint,
                        pressed && styles.quietActionDim,
                      ]}
                    >
                      <Text style={[styles.quietActionText, { color: tokens.fg2 }]}>
                        {allSelected
                          ? t('calendar.deselectAll')
                          : t('calendar.selectAll')}
                      </Text>
                    </Pressable>
                  }
                >
                  {plural(
                    t('calendar.eventsFound', { count: events.length }),
                    events.length,
                  )}
                </SectionLabel>
                {events.map(renderEventRow)}
                <View style={styles.actionPad}>
                  <PillButton
                    fullWidth
                    onPress={() => {
                      void handleImportSelected()
                    }}
                    disabled={selectedCount === 0 || !isOnline}
                  >
                    {plural(
                      t('calendar.importButton', { count: selectedCount }),
                      selectedCount,
                    )}
                  </PillButton>
                </View>
              </>
            )}
          </>
        )}

        {step === 'importing' && (
          <View
            style={styles.centerBlock}
            accessibilityLiveRegion="polite"
            accessibilityLabel={t('calendar.importing')}
          >
            <Text style={[styles.stateText, { color: tokens.fg3 }]}>
              {t('calendar.importing')}
            </Text>
            <View
              style={[styles.progressTrack, { backgroundColor: tokens.bgSunk }]}
            >
              <View
                style={[styles.progressFill, { backgroundColor: tokens.primary }]}
              />
            </View>
          </View>
        )}

        {step === 'done' && (
          <>
            <SectionLabel>
              {plural(
                t('calendar.importedCount', {
                  count: importResult?.imported ?? 0,
                }),
                importResult?.imported ?? 0,
              )}
            </SectionLabel>
            {importResult?.habits.map((habit) => (
              <SettingsRow
                key={habit.id}
                label={habit.title}
                onPress={() => router.push('/')}
                accessory="chevron"
              />
            ))}
            <View style={styles.actionPad}>
              <PillButton fullWidth onPress={() => router.replace('/')}>
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
            <Text style={[styles.stateText, { color: tokens.statusOverdue }]}>
              {errorMessage || t('calendar.errorTitle')}
            </Text>
            <Pressable
              onPress={handleRetry}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.quietAction,
                chipTint,
                pressed && styles.quietActionDim,
              ]}
            >
              <Text style={[styles.quietActionText, { color: tokens.fg2 }]}>
                {t('calendar.retry')}
              </Text>
            </Pressable>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

function createStyles() {
  return StyleSheet.create({
    safeArea: { flex: 1 },
    container: { flex: 1 },
    scrollContent: { paddingBottom: 40 },
    cardPad: {
      paddingHorizontal: 20,
    },
    connectionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      borderRadius: 16,
      borderWidth: 1,
      paddingVertical: 16,
      paddingHorizontal: 18,
    },
    connectionIconSlot: {
      width: 26,
      alignItems: 'center',
      flexShrink: 0,
    },
    connectionBody: {
      flex: 1,
      minWidth: 0,
    },
    connectionTitle: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 18,
      lineHeight: 22.5,
    },
    connectionMeta: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      lineHeight: 18,
      marginTop: 3,
    },
    syncNowRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: 20,
    },
    reconnectBlock: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      gap: 8,
      alignItems: 'flex-start',
    },
    stateText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 19.6,
      textAlign: 'center',
    },
    centerBlock: {
      paddingHorizontal: 24,
      paddingVertical: 32,
      alignItems: 'center',
      gap: 14,
    },
    eventRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    eventBody: {
      flex: 1,
      gap: 3,
    },
    eventTitle: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 15,
    },
    eventMeta: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 12,
      fontVariant: ['tabular-nums'],
    },
    quietAction: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      borderRadius: 999,
      borderWidth: 1,
      paddingVertical: 9,
      paddingHorizontal: 16,
    },
    quietActionDim: {
      opacity: 0.6,
      transform: [{ scale: 0.96 }],
    },
    quietActionText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
    },
    actionPad: {
      paddingHorizontal: 20,
      paddingVertical: 18,
    },
    progressTrack: {
      width: 200,
      height: 8,
      borderRadius: 999,
      overflow: 'hidden',
    },
    progressFill: {
      width: '60%',
      height: '100%',
      borderRadius: 999,
    },
  })
}
