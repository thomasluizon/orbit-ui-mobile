import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { TFunction } from 'i18next'
import type { CalendarSyncProfile } from '@orbit/shared/types/profile'
import {
  getCalendarSyncClockValue,
  isCalendarSyncConnectionActive,
} from '@orbit/shared/utils'
import { RefreshCw } from '@/components/ui/icons'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { PillButton } from '@/components/ui/pill-button'
import { Switch } from '@/components/ui/switch'
import type { AppTokensV2 } from '@/lib/theme'

interface CalendarSyncBoundaryProps {
  profile: CalendarSyncProfile
  displayTime: (time: string) => string
  onAutoSyncChange: (enabled: boolean) => Promise<void>
  onOpenPro: () => void
  t: TFunction
  tokens: AppTokensV2
}

export function CalendarSyncBoundary({
  profile,
  displayTime,
  onAutoSyncChange,
  onOpenPro,
  t,
  tokens,
}: Readonly<CalendarSyncBoundaryProps>) {
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(
    profile.googleCalendarAutoSyncEnabled,
  )
  const [isSaving, setIsSaving] = useState(false)

  if (!profile.hasProAccess) {
    return (
      <CapacityNotice
        message={t('calendar.dayDetail.syncBoundary')}
        body={t('calendar.dayDetail.syncBoundaryBody')}
        action={(
          <PillButton size="sm" variant="primary" onClick={onOpenPro}>
            {t('calendar.dayDetail.viewPro')}
          </PillButton>
        )}
      />
    )
  }

  const connected = isCalendarSyncConnectionActive(
    profile.hasGoogleConnection,
    profile.googleCalendarAutoSyncStatus,
  )
  const connectionLabel = connected
    ? t('calendar.dayDetail.googleConnected')
    : t('calendar.autoSync.reconnectTitle')
  const clockValue = getCalendarSyncClockValue(profile.googleCalendarLastSyncedAt)
  const lastSynced = clockValue
    ? t('calendar.dayDetail.lastSynced', { time: displayTime(clockValue) })
    : t('calendar.autoSync.lastSyncedNever')

  const handleAutoSyncChange = async (enabled: boolean) => {
    if (isSaving) return
    const previous = autoSyncEnabled
    setAutoSyncEnabled(enabled)
    setIsSaving(true)
    try {
      await onAutoSyncChange(enabled)
    } catch {
      setAutoSyncEnabled(previous)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <View style={styles.well} testID="calendar-sync-line">
      <View style={styles.connectionLine}>
        <RefreshCw size={16} strokeWidth={1.8} color={tokens.fg3} />
        <Text style={styles.connection}>
          {connectionLabel}
        </Text>
        <Text style={styles.lastSynced}>{lastSynced}</Text>
      </View>
      <View style={styles.switchLine}>
        <Text style={styles.switchLabel}>{t('calendar.dayDetail.autoSync')}</Text>
        <Switch
          checked={autoSyncEnabled}
          onChange={(enabled) => void handleAutoSyncChange(enabled)}
          label={t('calendar.dayDetail.autoSync')}
        />
      </View>
    </View>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    well: {
      gap: 8,
      padding: 12,
      borderRadius: 12,
      backgroundColor: tokens.bgWell,
    },
    connectionLine: {
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    connection: {
      minWidth: 0,
      flex: 1,
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      color: tokens.fg2,
    },
    lastSynced: {
      flexShrink: 0,
      fontFamily: 'GeistMono_400Regular',
      fontSize: 12,
      color: tokens.fg3,
      fontVariant: ['tabular-nums'],
    },
    switchLine: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    switchLabel: {
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      color: tokens.fg2,
    },
  })
}
