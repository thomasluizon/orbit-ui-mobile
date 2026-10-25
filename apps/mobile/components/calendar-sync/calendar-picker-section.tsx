import { IconButton } from '@/components/ui/icon-button'
import { ChevronDown, RefreshCw } from '@/components/ui/icons'
import { SPACING } from '@orbit/shared/theme'

import { useState } from 'react'
import { Text, View } from 'react-native'
import type { TFunction } from 'i18next'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import type { AppTokensV2 } from '@/lib/theme'
import { CheckRow } from '@/components/ui/check-row'
import { Skeleton } from '@/components/ui/skeleton'

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
    <View>
      <Text accessibilityRole="header" style={{ paddingBottom: SPACING.s12, fontFamily: 'Geist_500Medium', fontSize: 20, lineHeight: 24, color: tokens.fg1 }}>{t('calendar.calendars.readFrom')}</Text>
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.pickerStateText, { color: tokens.statusBadText, display: saveError ? undefined : 'none' }]}>{saveError ?? ''}</Text>

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
          <IconButton label={t('calendar.retry')} onPress={() => void refetch()} accessibilityRole="button"><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton>
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
              <CheckRow placement="column"
                label={calendar.name}
                textMode="personal"
                onOpenLabel={() => setOpenedCalendarId(openedCalendarId === calendar.id ? null : calendar.id)}
                labelExpanded={openedCalendarId === calendar.id}
                description={calendar.primary ? t('calendar.calendars.primaryLabel') : undefined}
                checked={calendar.isSynced}
                onChange={(checked) => handleToggle(calendar.id, checked)}
              />
            </View>
          ))
        : null}

      {!isLoading && !isError && calendars && calendars.length > 20 ? (
        <View style={styles.showMoreRow}>
          <Text style={[styles.showingCountText, { color: tokens.fg3 }]}>
            {t('calendar.showingCount', { shown: Math.min(visibleCount, calendars.length), total: calendars.length })}
          </Text>
          {visibleCount < calendars.length ? (
            <IconButton label={t('calendar.showMore')} onClick={() => setVisibleCount((count) => count + 20)}><ChevronDown size={20} strokeWidth={1.5} accessible={false} /></IconButton>
          ) : null}
        </View>
      ) : null}

    </View>
  )
}
