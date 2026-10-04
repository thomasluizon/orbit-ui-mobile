import { usePrefersReducedMotion } from '@/lib/motion'
import { PressFill } from '@/components/ui/press-fill'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { TFunction } from 'i18next'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import type { AppTokensV2 } from '@/lib/theme'
import { SettingsDescription } from '@/components/ui/settings-description'
import { CheckRow } from '@/components/ui/check-row'
import { Skeleton } from '@/components/ui/skeleton'
import { PillButton } from '@/components/ui/pill-button'
import { useCalendars, useSetSelectedCalendars } from '@/hooks/use-calendars'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import type { CalendarSyncStyles } from '@/components/calendar-sync/calendar-import-styles'

interface CalendarPickerSectionProps {
  styles: CalendarSyncStyles
  tokens: AppTokensV2
  t: TFunction
  enabled: boolean
}

/**
 * "Calendars" settings section: one check row per Google calendar, selecting
 * which calendars Orbit reads events from. Persists each toggle immediately.
 * Renders nothing until enabled so it stays hidden when Google is not connected.
 */
export function CalendarPickerSection({
  styles,
  tokens,
  t,
  enabled,
}: Readonly<CalendarPickerSectionProps>) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const { data: calendars, isLoading, isError, refetch } = useCalendars({ enabled })
  const setSelectedCalendars = useSetSelectedCalendars()
  const [saveError, setSaveError] = useAccountScopedState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(20)
  const [openedCalendarId, setOpenedCalendarId] = useAccountScopedState<string | null>(null)

  if (!enabled) return null

  function handleToggle(id: string, isSynced: boolean) {
    const generation = getAccountGeneration()
    setSaveError(null)
    setSelectedCalendars.mutate(
      { id, isSynced },
      {
        onError: (err: unknown) => {
          if (generation === getAccountGeneration()) setSaveError(getFriendlyErrorMessage(err, t, 'calendar.calendars.saveFailed', 'textless'))
        },
      },
    )
  }

  return (
    <View style={{ paddingTop: 24 }}>
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.pickerStateText, { color: tokens.statusBadText }]}>{saveError ?? ''}</Text>

      {isLoading ? <Skeleton variant="settings" rows={2} label={t('calendar.calendars.loading')} /> : null}

      {isError ? (
        <View style={styles.pickerStateRow} accessibilityRole="alert">
          <Text
            style={[
              styles.pickerStateText,
              { color: tokens.statusBadText, flex: 1 },
            ]}
          >
            {t('calendar.calendars.error')}
          </Text>
          <Pressable
            onPress={() => void refetch()}
            accessibilityRole="button"

            style={({ pressed }) => [
              styles.quietAction,
              { backgroundColor: tokens.bgElev, borderColor: tokens.hairline },
              pressed && { transform: [{ scale: prefersReducedMotion ? 1 : 0.96 }] },
            ]}
          >{({ pressed }) => <>
            <PressFill pressed={pressed} color={tokens.bgHoverOpaque} />
            <Text style={[styles.quietActionText, { color: tokens.fg2 }]}>
              {t('calendar.retry')}
            </Text>
          </>}</Pressable>
        </View>
      ) : null}

      {!isLoading && !isError && calendars && calendars.length === 0 ? (
        <View style={styles.pickerStateRow}>
          <Text style={[styles.pickerStateText, { color: tokens.fg3 }]}>
            {t('calendar.calendars.empty')}
          </Text>
        </View>
      ) : null}

      {!isLoading && !isError
        ? calendars?.slice(0, visibleCount).map((calendar) => (
            <View key={calendar.id}>
              <CheckRow
                label={calendar.name}
                textMode="personal"
                onOpenLabel={() => setOpenedCalendarId(openedCalendarId === calendar.id ? null : calendar.id)}
                labelExpanded={openedCalendarId === calendar.id}
                description={calendar.primary ? t('calendar.calendars.primaryLabel') : undefined}
                checked={calendar.isSynced}
                onChange={(checked) => handleToggle(calendar.id, checked)}
              />
              {openedCalendarId === calendar.id ? <Text style={[styles.pickerStateText, { color: tokens.fg1, paddingHorizontal: 16, paddingBottom: 12 }]}>{calendar.name}</Text> : null}
            </View>
          ))
        : null}

      {!isLoading && !isError && calendars && calendars.length > 20 ? (
        <View style={styles.showMoreRow}>
          <Text style={[styles.showingCountText, { color: tokens.fg3 }]}>
            {t('calendar.showingCount', { shown: Math.min(visibleCount, calendars.length), total: calendars.length })}
          </Text>
          {visibleCount < calendars.length ? (
            <PillButton variant="ghost" size="sm" onClick={() => setVisibleCount((count) => count + 20)}>
              {t('calendar.showMore')}
            </PillButton>
          ) : null}
        </View>
      ) : null}

      <SettingsDescription inset={false}>{t('calendar.calendars.description')}</SettingsDescription>
    </View>
  )
}
