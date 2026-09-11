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
import { RowList } from '@/components/ui/row-list'

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
  showSectionLabel = true,
  deviceLabel,
  deviceDescription,
  contained = false,
}: Readonly<{
  push: PushSectionState
  showSectionLabel?: boolean
  deviceLabel?: string
  deviceDescription?: string
  contained?: boolean
}>) {
  const t = useTranslations()
  const switchLabel = deviceLabel ?? t('settings.notifications.title')
  const content = (
    <>
      <SettingsRow
        label={deviceLabel ?? t('settings.notifications.allowed')}
        desc={deviceDescription}
        accessory="none"
        divider={false}
      >
        {push.supported && push.permission !== 'denied' && (
          <fieldset disabled={push.loading} className="m-0 border-0 p-0">
            <Switch
              checked={push.subscribed}
              onChange={push.onToggle}
              label={switchLabel}
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

  return (
    <>
      {showSectionLabel ? (
        <SectionLabel>{t('settings.notifications.title')}</SectionLabel>
      ) : null}
      {contained ? <RowList>{content}</RowList> : content}
    </>
  )
}
