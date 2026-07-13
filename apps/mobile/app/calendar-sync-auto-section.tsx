import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from 'react-native'
import { AlertTriangle, CalendarDays, RefreshCw } from 'lucide-react-native'
import type { TFunction } from 'i18next'
import { isCalendarAutoSyncStatusReconnectRequired } from '@orbit/shared/utils'
import type { CalendarAutoSyncState } from '@orbit/shared/types'
import type { AppTokensV2 } from '@/lib/theme'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsDescription } from '@/components/ui/settings-description'
import { Switch } from '@/components/ui/settings-row'
import type { CalendarSyncStyles } from './calendar-sync-styles'

interface CalendarAutoSyncSectionProps {
  styles: CalendarSyncStyles
  tokens: AppTokensV2
  chipTint: ViewStyle
  t: TFunction
  autoSyncState: CalendarAutoSyncState | undefined
  isStateLoading: boolean
  hasConnection: boolean
  connectionMeta: string
  isOnline: boolean
  isTogglePending: boolean
  isSyncNowPending: boolean
  isConnecting: boolean
  onToggleAutoSync: (enabled: boolean) => void
  onSyncNow: () => void
  onReconnect: () => void
}

// react-doctor-disable-next-line no-many-boolean-props -- Deliberate presentational section: independent loading/connection/online UI-state flags owned by the calendar-sync screen; an options-object rewrite would churn the caller and the web parity mirror for no runtime benefit. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function CalendarAutoSyncSection({
  styles,
  tokens,
  chipTint,
  t,
  autoSyncState,
  isStateLoading,
  hasConnection,
  connectionMeta,
  isOnline,
  isTogglePending,
  isSyncNowPending,
  isConnecting,
  onToggleAutoSync,
  onSyncNow,
  onReconnect,
}: Readonly<CalendarAutoSyncSectionProps>) {
  const enabled = autoSyncState?.enabled ?? false

  return (
    <>
      <SectionLabel bottom={10}>{t('calendar.autoSync.title')}</SectionLabel>
      <View style={styles.cardPad}>
        <View
          style={[
            styles.connectionCard,
            { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
          ]}
        >
          <View style={styles.connectionIconSlot}>
            <CalendarDays size={22} color={tokens.fg1} strokeWidth={1.8} />
          </View>
          <View style={styles.connectionBody}>
            <Text style={[styles.connectionTitle, { color: tokens.fg1 }]}>
              {t('calendar.title')}
            </Text>
            <Text
              style={[styles.connectionMeta, { color: tokens.fg3 }]}
              numberOfLines={2}
            >
              {connectionMeta}
            </Text>
          </View>
          <Switch
            on={enabled}
            onToggle={() => onToggleAutoSync(!enabled)}
            disabled={
              !hasConnection || isTogglePending || isStateLoading || !isOnline
            }
            accessibilityLabel={t('calendar.autoSync.title')}
          />
        </View>
      </View>
      <SettingsDescription>
        {t('calendar.autoSync.description')}
      </SettingsDescription>
      {hasConnection ? (
        <View style={styles.syncNowRow}>
          <Pressable
            onPress={onSyncNow}
            disabled={isSyncNowPending}
            accessibilityRole="button"
            accessibilityLabel={t('calendar.autoSync.syncNow')}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            style={({ pressed }) => [
              styles.quietAction,
              chipTint,
              (pressed || isSyncNowPending) && styles.quietActionDim,
            ]}
          >
            {isSyncNowPending ? (
              <ActivityIndicator size={14} color={tokens.fg2} />
            ) : (
              <RefreshCw size={13} color={tokens.fg2} strokeWidth={2} />
            )}
            <Text style={[styles.quietActionText, { color: tokens.fg2 }]}>
              {isSyncNowPending
                ? t('calendar.autoSync.syncNowRunning')
                : t('calendar.autoSync.syncNow')}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {isCalendarAutoSyncStatusReconnectRequired(autoSyncState?.status) ? (
        <View style={styles.reconnectBlock}>
          <View style={styles.reconnectTitleRow}>
            <AlertTriangle
              size={16}
              color={tokens.statusOverdueText}
              strokeWidth={1.8}
            />
            <Text style={[styles.reconnectTitle, { color: tokens.statusOverdueText }]}>
              {t('calendar.autoSync.reconnectTitle')}
            </Text>
          </View>
          <Text style={[styles.stateText, { color: tokens.fg3 }]}>
            {t('calendar.autoSync.reconnectBody')}
          </Text>
          <Pressable
            onPress={onReconnect}
            disabled={isConnecting}
            accessibilityRole="button"
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            style={({ pressed }) => [
              styles.quietAction,
              chipTint,
              (pressed || isConnecting) && styles.quietActionDim,
            ]}
          >
            <Text
              style={[styles.quietActionText, { color: tokens.statusOverdueText }]}
            >
              {t('calendar.autoSync.reconnectCta')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </>
  )
}
