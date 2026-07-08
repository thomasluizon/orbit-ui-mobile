import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import type { TFunction } from 'i18next'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import type { AppTokensV2 } from '@/lib/theme'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsDescription } from '@/components/ui/settings-description'
import { SettingsRow, Switch } from '@/components/ui/settings-row'
import { useCalendars, useSetSelectedCalendars } from '@/hooks/use-calendars'
import { useAppToast } from '@/hooks/use-app-toast'
import type { CalendarSyncStyles } from './calendar-sync-styles'

interface CalendarPickerSectionProps {
  styles: CalendarSyncStyles
  tokens: AppTokensV2
  t: TFunction
  enabled: boolean
}

/**
 * "Calendars" settings section: one Switch row per Google calendar, toggling
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

  if (!enabled) return null

  function handleToggle(id: string, isSynced: boolean) {
    setSelectedCalendars.mutate(
      { id, isSynced },
      {
        onError: (err: unknown) => {
          showError(getFriendlyErrorMessage(err, t, 'calendar.calendars.saveFailed', 'generic'))
        },
      },
    )
  }

  return (
    <>
      <SectionLabel bottom={10}>{t('calendar.calendars.title')}</SectionLabel>

      {isLoading ? (
        <View
          style={styles.pickerStateRow}
          accessibilityLiveRegion="polite"
          accessibilityLabel={t('calendar.calendars.loading')}
        >
          <ActivityIndicator color={tokens.primary} size="small" />
          <Text style={[styles.pickerStateText, { color: tokens.fg2 }]}>
            {t('calendar.calendars.loading')}
          </Text>
        </View>
      ) : null}

      {isError && !isLoading ? (
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
        ? calendars?.map((calendar, index) => (
            <SettingsRow
              key={calendar.id}
              label={calendar.name}
              desc={calendar.primary ? t('calendar.calendars.primaryLabel') : undefined}
              leadingDot={calendar.backgroundColor ?? undefined}
              accessory="none"
              divider={index < calendars.length - 1}
            >
              <Switch
                on={calendar.isSynced}
                onToggle={() => handleToggle(calendar.id, !calendar.isSynced)}
                accessibilityLabel={t('calendar.calendars.toggleLabel', {
                  name: calendar.name,
                })}
              />
            </SettingsRow>
          ))
        : null}

      <SettingsDescription>{t('calendar.calendars.description')}</SettingsDescription>
    </>
  )
}
