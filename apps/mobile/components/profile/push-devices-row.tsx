import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { getNativePushStatusPresentation, type NativePushRegistrationStatus } from '@orbit/shared/utils'
import type { NotificationPermissionStatus } from '@/lib/push-notification-permissions'
import { RowList } from '@/components/ui/row-list'
import { Switch } from '@/components/ui/switch'
import { PillButton } from '@/components/ui/pill-button'
import { RotateCcw } from '@/components/ui/icons'
import type { AppTokensV2 } from '@/lib/theme'

function PushDevicesFeedback({
  tokens,
  error,
  full,
  supported,
  permissionStatus,
  registrationStatus,
  currentDeviceRegistered,
  onOpenSettings,
  onRetry,
}: Readonly<{
  tokens: AppTokensV2
  error: boolean
  full: boolean
  supported: boolean
  permissionStatus: NotificationPermissionStatus | null
  registrationStatus: NativePushRegistrationStatus
  currentDeviceRegistered: boolean
  onOpenSettings: () => void
  onRetry: () => void
}>) {
  const { t } = useTranslation()
  const pushStatus = getNativePushStatusPresentation({
    permissionStatus,
    registrationStatus,
    isEnabled: currentDeviceRegistered,
    isRegistered: currentDeviceRegistered,
  })
  const showPushStatus = !supported || permissionStatus === 'denied'
    || registrationStatus === 'sync-failed' || registrationStatus === 'token-missing'
  return (
    <>
      {error ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12 }}>
        <Text accessibilityRole="alert" style={{ flex: 1, color: tokens.statusBadText, fontSize: 14 }}>
          {t('profile.settingsRows.devicesUnavailable')}
        </Text>
        <PillButton variant="ghost" size="sm" iconOnly label={t('common.retry')} onClick={onRetry}>
          <RotateCcw size={16} color={tokens.fg2} strokeWidth={1.8} />
        </PillButton>
      </View> : null}
      {full ? (
        <Text style={{ color: tokens.fg3, paddingHorizontal: 16, paddingBottom: 12, fontSize: 14 }}>
          {t('profile.settingsRows.pushDeviceLimit')}
        </Text>
      ) : null}
      {showPushStatus ? (
        <Text accessibilityRole="alert" style={{ color: pushStatus.tone === 'critical' ? tokens.statusBadText : tokens.fg3, paddingHorizontal: 16, paddingBottom: 12, fontSize: 14 }}>
          {t(pushStatus.messageKey)}
        </Text>
      ) : null}
      {permissionStatus === 'denied' ? (
        <Pressable accessibilityRole="button" onPress={onOpenSettings} style={{ minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' }}>
          <Text style={{ color: tokens.fg2, fontFamily: 'Geist_500Medium', fontSize: 14 }}>{t('settings.notifications.openSettings')}</Text>
        </Pressable>
      ) : null}
    </>
  )
}

export function PushDevicesRow({
  tokens,
  count,
  max,
  currentDeviceRegistered,
  supported,
  loading,
  error,
  permissionStatus,
  registrationStatus,
  onToggle,
  onOpenSettings,
  onRetry,
}: Readonly<{
  tokens: AppTokensV2
  count: number | undefined
  max: number | undefined
  currentDeviceRegistered: boolean
  supported: boolean
  loading: boolean
  error: boolean
  permissionStatus: NotificationPermissionStatus | null
  registrationStatus: NativePushRegistrationStatus
  onToggle: () => void
  onOpenSettings: () => void
  onRetry: () => void
}>) {
  const { t } = useTranslation()
  const canEnable = count !== undefined && max !== undefined && count < max
  const disabled = loading || error || !supported || (!currentDeviceRegistered && !canEnable)
  return (
    <View accessibilityState={{ busy: loading }}>
    <RowList>
      <View style={{ minHeight: 44, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ flex: 1, color: tokens.fg1, fontFamily: 'Geist_400Regular', fontSize: 17 }}>
          {t('profile.settingsRows.devices')}
        </Text>
        <View style={{ minWidth: 64, alignItems: 'flex-end' }}>
          {count !== undefined && max !== undefined ? (
            <Text style={{ color: tokens.fg3, fontFamily: 'GeistMono_400Regular', fontSize: 12 }}>
              {t('profile.settingsRows.devicesCount', { count, max })}
            </Text>
          ) : loading ? (
            <View accessibilityRole="progressbar" accessibilityLabel={t('profile.loading')}
              style={{ width: 48, height: 16, borderRadius: 8, backgroundColor: tokens.bgWell }} />
          ) : null}
        </View>
      </View>
      <View style={{ minHeight: 44, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ flex: 1, color: tokens.fg2, fontFamily: 'Geist_400Regular', fontSize: 14 }}>
          {t('profile.settingsRows.currentDevice')}
        </Text>
        <View pointerEvents={disabled ? 'none' : 'auto'} accessible={disabled} accessibilityRole={disabled ? 'switch' : undefined}
          accessibilityLabel={disabled ? t('profile.settingsRows.alertsOnThisDevice') : undefined}
          accessibilityState={disabled ? { checked: currentDeviceRegistered, disabled: true } : undefined}>
          <View accessibilityElementsHidden={disabled} importantForAccessibility={disabled ? 'no-hide-descendants' : 'auto'}>
            <Switch checked={currentDeviceRegistered} onChange={onToggle} label={t('profile.settingsRows.alertsOnThisDevice')} />
          </View>
        </View>
      </View>
      <PushDevicesFeedback
        tokens={tokens}
        error={error}
        full={!error && !currentDeviceRegistered && !canEnable && count !== undefined}
        supported={supported}
        permissionStatus={permissionStatus}
        registrationStatus={registrationStatus}
        currentDeviceRegistered={currentDeviceRegistered}
        onOpenSettings={onOpenSettings}
        onRetry={onRetry}
      />
    </RowList>
    </View>
  )
}
