import { usePushNotifications } from '@/hooks/use-push-notifications'
import { usePushSubscriptions } from '@/hooks/use-push-subscriptions'
import { MarketingConsentSection } from '@/components/marketing-consent/marketing-consent-section'
import { PushDevicesRow } from '@/components/profile/push-devices-row'

import { useTranslation } from 'react-i18next'
import { useCallback, useEffect } from 'react'
import { AppState, Linking, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export function ProfileNotificationsContent() {
  const { t } = useTranslation()
  const pushPreferences = usePushNotifications()
  const pushSubscriptions = usePushSubscriptions(pushPreferences.expoPushToken)
  const refreshPushSubscriptions = pushSubscriptions.refresh
  useFocusEffect(useCallback(() => {
    void refreshPushSubscriptions()
  }, [refreshPushSubscriptions]))
  const { isSupported: pushSupported, refreshPermissionStatus } = pushPreferences
  useEffect(() => {
    if (!pushSupported) return
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshPermissionStatus()
    })
    return () => subscription.remove()
  }, [pushSupported, refreshPermissionStatus])
  async function handlePushToggle() {
    if (pushSubscriptions.isCurrentDeviceRegistered) {
      await pushPreferences.disablePushNotifications()
    } else if (pushPreferences.permissionStatus === 'denied') {
      await Linking.openSettings()
    } else {
      await pushPreferences.requestPermission()
    }
    await pushSubscriptions.refresh()
  }
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <View style={{ gap: 12 }}>
      <PushDevicesRow
        tokens={tokens}
        count={pushSubscriptions.count}
        max={pushSubscriptions.max}
        currentDeviceRegistered={pushSubscriptions.isCurrentDeviceRegistered}
        supported={pushPreferences.isSupported}
        loading={pushPreferences.isLoading || pushSubscriptions.isLoading}
        error={pushSubscriptions.isError}
        permissionStatus={pushPreferences.permissionStatus}
        registrationStatus={pushPreferences.registrationStatus}
        limitError={pushPreferences.error === t('profile.settingsRows.pushDeviceLimit')}
        onToggle={() => void handlePushToggle()}
        onOpenSettings={() => void Linking.openSettings()}
        onRetry={() => void pushSubscriptions.refresh()}
      />
      <MarketingConsentSection showSectionLabel={false} contained />
      <Text style={{ color: tokens.fg3, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21.7 }}>
        {t('profile.settingsRows.remindersNote')}
      </Text>
    </View>
}
