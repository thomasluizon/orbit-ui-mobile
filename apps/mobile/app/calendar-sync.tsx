import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  Link,
  Loader2,
} from 'lucide-react-native'
import { API } from '@orbit/shared/api'
import { getErrorMessage } from '@orbit/shared/utils/error-utils'
import type { BulkCreateRequest, FrequencyUnit } from '@orbit/shared/types/habit'
import { useProfile } from '@/hooks/use-profile'
import { useBulkCreateHabits } from '@/hooks/use-habits'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient } from '@/lib/api-client'
import { radius, shadows } from '@/lib/theme'
import { plural } from '@/lib/plural'
import { startMobileGoogleAuth } from '@/lib/google-auth'
import { useAppTheme } from '@/lib/use-app-theme'

type Step = 'loading' | 'select' | 'importing' | 'done' | 'error' | 'not-connected'

interface CalendarEvent {
  id: string
  title: string
  description: string | null
  startDate: string | null
  startTime: string | null
  endTime: string | null
  isRecurring: boolean
  recurrenceRule: string | null
  reminders: number[]
}

interface ImportResult {
  imported: number
  habits: { id: string; title: string }[]
}

interface ParsedRecurrence {
  frequencyUnit?: FrequencyUnit
  frequencyQuantity?: number
  days?: string[]
}

function parseRRule(rule: string | null): ParsedRecurrence {
  if (!rule) return {}

  const parts: Record<string, string> = Object.fromEntries(
    rule
      .replace('RRULE:', '')
      .split(';')
      .map((part) => {
        const [key, value] = part.split('=')
        return key ? [key, value ?? ''] as const : null
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  )

  const freqMap: Record<string, FrequencyUnit> = {
    DAILY: 'Day',
    WEEKLY: 'Week',
    MONTHLY: 'Month',
    YEARLY: 'Year',
  }

  const dayMap: Record<string, string> = {
    MO: 'Monday',
    TU: 'Tuesday',
    WE: 'Wednesday',
    TH: 'Thursday',
    FR: 'Friday',
    SA: 'Saturday',
    SU: 'Sunday',
  }

  const result: ParsedRecurrence = {}

  if (parts.FREQ && parts.FREQ in freqMap) {
    result.frequencyUnit = freqMap[parts.FREQ]
  }

  if (parts.INTERVAL) {
    const parsed = Number.parseInt(parts.INTERVAL, 10)
    if (Number.isFinite(parsed) && parsed >= 1) {
      result.frequencyQuantity = parsed
    }
  } else if (result.frequencyUnit) {
    result.frequencyQuantity = 1
  }

  if (parts.BYDAY) {
    const days = parts.BYDAY
      .split(',')
      .map((day) => dayMap[day.trim()])
      .filter((day): day is string => !!day)

    if (days.length > 0) {
      result.days = days
    }
  }

  return result
}

function formatRecurrenceLabel(rule: string | null, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (!rule) return ''

  const upper = rule.toUpperCase()
  const intervalMatch = /INTERVAL=(\d+)/.exec(upper)
  const interval = intervalMatch?.[1] ? Number.parseInt(intervalMatch[1], 10) : 1

  if (upper.includes('FREQ=DAILY')) {
    return interval > 1
      ? plural(t('calendar.recurrenceEveryNDays', { n: interval }), interval)
      : t('calendar.recurrenceDaily')
  }

  if (upper.includes('FREQ=WEEKLY')) {
    const dayMatch = /BYDAY=([A-Z,]+)/.exec(upper)
    const days = dayMatch ? dayMatch[1] : ''

    if (interval > 1) {
      const base = plural(t('calendar.recurrenceEveryNWeeks', { n: interval }), interval)
      return days ? `${base} (${days})` : base
    }

    if (days) return t('calendar.recurrenceWeeklyDays', { days })
    return t('calendar.recurrenceWeekly')
  }

  if (upper.includes('FREQ=MONTHLY')) {
    return interval > 1
      ? plural(t('calendar.recurrenceEveryNMonths', { n: interval }), interval)
      : t('calendar.recurrenceMonthly')
  }

  if (upper.includes('FREQ=YEARLY')) {
    return t('calendar.recurrenceYearly')
  }

  return ''
}

function isNotConnectedMessage(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('not connected') ||
    lower.includes('unauthorized') ||
    lower.includes('invalid authentication credentials') ||
    lower.includes('google calendar') ||
    lower.includes('calendar connection')
  )
}

async function fetchCalendarEvents(): Promise<CalendarEvent[]> {
  try {
    const data = await apiClient<CalendarEvent[]>(API.calendar.events)
    return Array.isArray(data) ? data : []
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : ''
    if (message === 'Unauthorized' || isNotConnectedMessage(message)) {
      throw new Error('__NOT_CONNECTED__')
    }

    throw err
  }
}

function buildImportRequest(events: CalendarEvent[]): BulkCreateRequest {
  return {
    habits: events.map((event) => {
      const recurrence = parseRRule(event.recurrenceRule)
      const hasRecurrence = !!recurrence.frequencyUnit
      const quantity = hasRecurrence && recurrence.frequencyQuantity && recurrence.frequencyQuantity >= 1
        ? recurrence.frequencyQuantity
        : hasRecurrence
          ? 1
          : null

      return {
        title: event.title,
        description: event.description,
        dueDate: event.startDate,
        dueTime: event.startTime,
        dueEndTime: event.endTime,
        frequencyUnit: recurrence.frequencyUnit ?? null,
        frequencyQuantity: quantity,
        days: quantity === 1 ? (recurrence.days ?? null) : null,
        reminderEnabled: event.reminders.length > 0,
        reminderTimes: event.reminders.length > 0 ? event.reminders : null,
      }
    }),
  }
}

export default function CalendarSyncScreen() {
  const router = useRouter()
  const { t, i18n } = useTranslation()
  const { profile, isLoading: isProfileLoading, invalidate } = useProfile()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const login = useAuthStore((s) => s.login)
  const bulkCreateHabits = useBulkCreateHabits()

  const [step, setStep] = useState<Step>('loading')
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [errorMessage, setErrorMessage] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const hasCheckedAccessRef = useRef(false)

  const allSelected = events.length > 0 && selectedIds.size === events.length

  const selectedEvents = useMemo(
    () => events.filter((event) => selectedIds.has(event.id)),
    [events, selectedIds],
  )

  const selectedCount = selectedIds.size

  const loadEvents = useCallback(async () => {
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

      setErrorMessage(getErrorMessage(err, t('calendar.fetchError')))
      setStep('error')
    }
  }, [t])

  useEffect(() => {
    if (hasCheckedAccessRef.current) return
    if (!profile) return

    hasCheckedAccessRef.current = true

    if (!profile.hasProAccess) {
      router.replace('/upgrade')
      return
    }

    void loadEvents()
  }, [loadEvents, profile, router])

  const handleBack = useCallback(() => {
    router.push('/profile')
  }, [router])

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
    if (isConnecting) return

    setIsConnecting(true)
    setErrorMessage('')

    try {
      const response = await startMobileGoogleAuth({
        language: i18n.language,
        returnUrl: '/calendar-sync',
      })

      if (!response) return

      await login(response.token, response.refreshToken, {
        userId: response.userId,
        name: response.name,
        email: response.email,
      })
      await invalidate()
      await loadEvents()
    } catch {
      setErrorMessage(t('auth.googleError'))
    } finally {
      setIsConnecting(false)
    }
  }, [i18n.language, invalidate, isConnecting, loadEvents, login, t])

  const handleImportSelected = useCallback(async () => {
    if (selectedCount === 0) return

    setStep('importing')
    setErrorMessage('')

    try {
      const request = buildImportRequest(selectedEvents)
      const result = await bulkCreateHabits.mutateAsync(request)

      const successCount = result.results.filter((item) => item.status === 'Success').length
      const failedItems = result.results.filter((item) => item.status !== 'Success')

      if (failedItems.length > 0 && successCount === 0) {
        setErrorMessage(
          failedItems
            .map((item) => `${item.title ?? 'Unknown'}: ${item.error ?? 'Failed'}`)
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
    } catch (err: unknown) {
      setErrorMessage(getErrorMessage(err, t('calendar.importError')))
      setStep('error')
    }
  }, [bulkCreateHabits, selectedCount, selectedEvents, t])

  const handleRetry = useCallback(() => {
    void loadEvents()
  }, [loadEvents])

  const renderEventCard = (event: CalendarEvent) => {
    const selected = selectedIds.has(event.id)
    const recurrenceLabel = formatRecurrenceLabel(event.recurrenceRule, t)
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
          <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.8}>
            <ArrowLeft size={18} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('calendar.title')}</Text>
        </View>

        {(isProfileLoading || step === 'loading') && (
          <View style={styles.centerState}>
            <View style={styles.stateIcon}>
              <Loader2 size={26} color={colors.primary400} />
            </View>
            <Text style={styles.stateTitle}>{t('calendar.fetchingEvents')}</Text>
          </View>
        )}

        {step === 'not-connected' && !isProfileLoading && (
          <View style={styles.centerState}>
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

        {step === 'select' && (
          <View style={styles.contentStack}>
            {events.length === 0 ? (
              <View style={styles.centerState}>
                <View style={styles.stateIcon}>
                  <CalendarDays size={26} color={colors.textMuted} />
                </View>
                <Text style={styles.stateTitle}>{t('calendar.noEvents')}</Text>
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
                  <TouchableOpacity onPress={toggleAll} activeOpacity={0.7}>
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
                    selectedCount === 0 && styles.buttonDisabled,
                  ]}
                  onPress={handleImportSelected}
                  disabled={selectedCount === 0}
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
          <View style={styles.centerState}>
            <View style={styles.stateIcon}>
              <ActivityIndicator color={colors.primary400} />
            </View>
            <Text style={styles.stateTitle}>{t('calendar.importing')}</Text>
          </View>
        )}

        {step === 'done' && (
          <View style={styles.centerState}>
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
          <View style={styles.centerState}>
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
  })
}
