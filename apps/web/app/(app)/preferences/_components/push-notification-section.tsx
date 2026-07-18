'use client'

import { useTranslations } from 'next-intl'
import type { WebPushPermission, WebPushPreferenceStatus } from '@orbit/shared/utils'
import {
  getPushStatusMessageKey,
  getPushStatusTone,
} from '@/hooks/use-push-notification-preferences'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsDescription } from '@/components/ui/settings-description'
import { SettingsRow, Switch } from '@/components/ui/settings-row'

export interface PushSectionState {
  supported: boolean
  subscribed: boolean
  permission: WebPushPermission
  loading: boolean
  status: WebPushPreferenceStatus
  onToggle: () => void
}

export function PushNotificationSection({
  push,
}: Readonly<{ push: PushSectionState }>) {
  const t = useTranslations()

  return (
    <>
      <SectionLabel bottom={4}>{t('settings.notifications.title')}</SectionLabel>
      <SettingsRow
        label={t('settings.notifications.allowed')}
        accessory="none"
      >
        {push.supported && push.permission !== 'denied' && (
          <Switch
            on={push.subscribed}
            onToggle={push.onToggle}
            ariaLabel={t('settings.notifications.title')}
            disabled={push.loading}
          />
        )}
      </SettingsRow>
      <SettingsDescription>
        {t('settings.notifications.description')}
      </SettingsDescription>
      <div
        className={getPushStatusTone(push.status)}
        style={{
          padding: '0 20px 14px',
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        {push.supported
          ? t(getPushStatusMessageKey(push.status, push.permission))
          : t('settings.notifications.unsupported')}
      </div>
    </>
  )
}
