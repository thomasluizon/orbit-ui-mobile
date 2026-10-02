'use client'

import { usePushNotificationPreferences } from '@/hooks/use-push-notification-preferences'
import { usePushSubscriptions } from '@/hooks/use-push-subscriptions'
import { MarketingConsentSection } from '@/app/(app)/preferences/_components/marketing-consent-section'
import { PushDevicesRow } from '@/components/profile/push-devices-row'

import { useTranslations } from 'next-intl'

export function ProfileNotificationsContent() {
  const t = useTranslations()
  const pushPreferences = usePushNotificationPreferences()
  const pushSubscriptions = usePushSubscriptions()
  const toggleThisDevice = async () => {
    await pushPreferences.togglePush(!pushSubscriptions.isCurrentDeviceRegistered)
    await pushSubscriptions.refresh()
  }
  return <div className="flex flex-col" style={{ gap: 12 }}>
      <MarketingConsentSection showSectionLabel={false} contained acceptVariant="secondary" />
      <PushDevicesRow
        count={pushSubscriptions.count}
        max={pushSubscriptions.max}
        currentDeviceRegistered={pushSubscriptions.isCurrentDeviceRegistered}
        supported={pushPreferences.supported && pushPreferences.permission !== 'denied'}
        loading={pushPreferences.loading || pushSubscriptions.isLoading}
        error={pushSubscriptions.isError}
        permission={pushPreferences.permission}
        status={pushPreferences.status}
        onToggle={() => void toggleThisDevice()}
        onRetry={() => void pushSubscriptions.refresh()}
      />
      <p className="m-0 text-pretty text-sm leading-[1.55] text-[var(--fg-3)]">{t('profile.settingsRows.remindersNote')}</p>
    </div>
}
