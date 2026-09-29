import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { TFunction } from 'i18next'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import type { AppTokensV2 } from '@/lib/theme'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsDescription } from '@/components/ui/settings-description'
import { CheckRow } from '@/components/ui/check-row'
import { Skeleton } from '@/components/ui/skeleton'
import { PillButton } from '@/components/ui/pill-button'
import { useCalendars, useSetSelectedCalendars } from '@/hooks/use-calendars'
import { useAppToast } from '@/hooks/use-app-toast'
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
  const { data: calendars, isLoading, isError, refetch } = useCalendars({ enabled })
  const setSelectedCalendars = useSetSelectedCalendars()
  const { showError } = useAppToast()
  const [visibleCount, setVisibleCount] = useState(20)

  if (!enabled) return null

  function handleToggle(id: string, isSynced: boolean) {
    setSelectedCalendars.mutate(
      { id, isSynced },
      {
        onError: (err: unknown) => {
          showError(getFriendlyErrorMessage(err, t, 'calendar.calendars.saveFailed', 'textless'))
        },
      },
    )
  }

  return (
    <>
      <SectionLabel>{t('calendar.calendars.title')}</SectionLabel>

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
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            style={({ pressed }) => [
              styles.quietAction,
              { backgroundColor: tokens.bgElev, borderColor: tokens.hairline },
              pressed && styles.quietActionDim,
            ]}
          >
            <Text style={[styles.quietActionText, { color: tokens.fg2 }]}>
              {t('calendar.retry')}
            </Text>
          </Pressable>
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
            <CheckRow
              key={calendar.id}
              label={calendar.name}
              description={calendar.primary ? t('calendar.calendars.primaryLabel') : undefined}
              checked={calendar.isSynced}
              onChange={(checked) => handleToggle(calendar.id, checked)}
            />
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

      <SettingsDescription>{t('calendar.calendars.description')}</SettingsDescription>
    </>
  )
}
