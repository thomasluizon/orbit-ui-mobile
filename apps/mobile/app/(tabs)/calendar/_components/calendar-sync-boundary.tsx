import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { TFunction } from 'i18next'
import type { CalendarAutoSyncState } from '@orbit/shared/types/calendar'
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
  hasProAccess: boolean
  autoSyncState: CalendarAutoSyncState | undefined
  displayTime: (time: string) => string
  onAutoSyncChange: (enabled: boolean) => Promise<void>
  onOpenPro: () => void
  t: TFunction
  tokens: AppTokensV2
}

export function CalendarSyncBoundary({
  hasProAccess,
  autoSyncState,
  displayTime,
  onAutoSyncChange,
  onOpenPro,
  t,
  tokens,
}: Readonly<CalendarSyncBoundaryProps>) {
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const [isSaving, setIsSaving] = useState(false)

  if (!hasProAccess) {
    return (
      <CapacityNotice
        message={t('calendar.dayDetail.syncBoundary')}
        body={t('calendar.dayDetail.syncBoundaryBody')}
        action={(
          /* eslint-disable-next-line local/max-button-words -- ORB-50 owns this approved control copy. */
          <PillButton size="sm" variant="primary" onClick={onOpenPro}>
            {t('calendar.dayDetail.viewPro')}
          </PillButton>
        )}
      />
    )
  }

  const connected = isCalendarSyncConnectionActive(
    autoSyncState?.hasGoogleConnection ?? false,
    autoSyncState?.status ?? 'Idle',
  )
  const connectionLabel = connected
    ? t('calendar.dayDetail.googleConnected')
    : t('calendar.autoSync.reconnectTitle')
  const clockValue = getCalendarSyncClockValue(autoSyncState?.lastSyncedAt ?? null)
  const lastSynced = clockValue
    ? t('calendar.dayDetail.lastSynced', { time: displayTime(clockValue) })
    : t('calendar.autoSync.lastSyncedNever')

  const handleAutoSyncChange = async (enabled: boolean) => {
    if (isSaving) return
    setIsSaving(true)
    try {
      await onAutoSyncChange(enabled)
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
      {connected ? (
        <View style={styles.switchLine}>
          <Text style={styles.switchLabel}>{t('calendar.dayDetail.autoSync')}</Text>
          <Switch
            checked={autoSyncState?.enabled ?? false}
            onChange={(enabled) => void handleAutoSyncChange(enabled)}
            label={t('calendar.dayDetail.autoSync')}
          />
        </View>
      ) : null}
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
