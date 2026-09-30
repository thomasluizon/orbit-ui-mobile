'use client'

import { useTranslations } from 'next-intl'
import type { WebPushPermission } from '@orbit/shared/utils'
import {
  getPushStatusMessageKey,
  getPushStatusTone,
  type PushPreferenceStatus,
} from '@/hooks/use-push-notification-preferences'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsDescription } from '@/components/ui/settings-description'
import { SettingsRow, Switch } from '@/components/ui/settings-row'

export interface PushSectionState {
  supported: boolean
  subscribed: boolean
  permission: WebPushPermission
  loading: boolean
  status: PushPreferenceStatus
  onToggle: () => void
}

/** While the browser is checked, an invisible switch holds the row height so nothing shifts when it answers. */
function PushSwitch({ push }: Readonly<{ push: PushSectionState }>) {
  const t = useTranslations()

  if (push.status === 'checking') {
    return (
      <span aria-hidden="true" className="invisible">
        <Switch on={false} onToggle={push.onToggle} ariaLabel={t('settings.notifications.title')} disabled />
      </span>
    )
  }

  if (!push.supported || push.permission === 'denied') return null

  return (
    <Switch
      on={push.subscribed}
      onToggle={push.onToggle}
      ariaLabel={t('settings.notifications.title')}
      disabled={push.loading}
    />
  )
}

export function PushNotificationSection({
  push,
}: Readonly<{ push: PushSectionState }>) {
  const t = useTranslations()

  function getStatusText(): string {
    if (push.status === 'checking') return '\u00A0'
    if (!push.supported) return t('settings.notifications.unsupported')
    return t(getPushStatusMessageKey(push.status, push.permission))
  }

  return (
    <>
      <SectionLabel bottom={4}>{t('settings.notifications.title')}</SectionLabel>
      <SettingsRow
        label={t('settings.notifications.allowed')}
        accessory="none"
        divider={false}
      >
        <PushSwitch push={push} />
      </SettingsRow>
      <SettingsDescription>
        {t('settings.notifications.description')}
      </SettingsDescription>
      <div
        data-testid="push-status"
        className={push.status === 'checking' ? undefined : getPushStatusTone(push.status)}
        style={{
          padding: '0 20px 14px',
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        {getStatusText()}
      </div>
    </>
  )
}
