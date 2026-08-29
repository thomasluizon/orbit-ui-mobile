'use client'

import { useTranslations } from 'next-intl'
import type { WebPushPermission, WebPushPreferenceStatus } from '@orbit/shared/utils'
import {
  getPushStatusMessageKey,
  getPushStatusTone,
} from '@/hooks/use-push-notification-preferences'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsDescription } from '@/components/ui/settings-description'
import { SettingsRow } from '@/components/ui/settings-row'
import { Switch } from '@/components/ui/switch'

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
        divider={false}
      >
        {push.supported && push.permission !== 'denied' && (
          <fieldset disabled={push.loading} className="m-0 border-0 p-0">
            <Switch
              checked={push.subscribed}
              onChange={push.onToggle}
              label={t('settings.notifications.title')}
            />
          </fieldset>
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
