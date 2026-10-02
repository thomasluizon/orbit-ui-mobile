'use client'

import { useShellNoticeSlot } from '@/hooks/use-shell-notice-slot'
import { ListRow } from '@/components/ui/list-row'
import { SettingsRow } from '@/components/ui/settings-row'
import { Switch } from '@/components/ui/switch'
import { Toast } from '@/components/ui/toast'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { getAnalyticsOptOut, setAnalyticsOptOut, subscribeAnalyticsOptOut } from '@/lib/posthog'
import { DeleteAccountModal } from './delete-account-modal'
import { EditNameSheet } from './edit-name-sheet'
import { FreshStartModal } from './fresh-start-modal'
import { useDataExport } from './use-data-export'

import { useRef, useState, useSyncExternalStore } from 'react'
import { BarChart3, Download, RotateCcw, UserX } from '@/components/ui/icons'
import { RowList } from '@/components/ui/row-list'
import type { Profile } from '@orbit/shared/types/profile'
import { useTranslations } from 'next-intl'

interface ProfileContentProps {
  profile: Profile | undefined
  patchProfile: (patch: Partial<Profile>) => void
}

const getServerAnalyticsOptOut = () => null

const icon = (IconComponent: typeof Download) => <IconComponent size={24} strokeWidth={1.8} />

export function ProfileAccountContent({ profile }: Readonly<ProfileContentProps>) {
  const t = useTranslations()
  const {
    isExporting,
    exportDone,
    exportError,
    exportData,
    clearExportDone,
  } = useDataExport()
  const [showEditName, setShowEditName] = useAccountScopedState(false)
  const [showFreshStart, setShowFreshStart] = useAccountScopedState(false)
  const [showDeleteAccount, setShowDeleteAccount] = useAccountScopedState(false)
  const optedOut = useSyncExternalStore(subscribeAnalyticsOptOut, getAnalyticsOptOut, getServerAnalyticsOptOut)
  const analyticsEnabled = optedOut === null ? null : !optedOut
  const [analyticsSaveError, setAnalyticsSaveError] = useState(false)
  const analyticsChange = useRef(0)
  const onToggleAnalytics = (next: boolean) => {
    const change = ++analyticsChange.current
    setAnalyticsSaveError(false)
    void setAnalyticsOptOut(!next).catch(() => {
      if (change !== analyticsChange.current) return
      setAnalyticsSaveError(true)
    })
  }
  useShellNoticeSlot(
    exportDone,
    () => (
      <Toast
        kind="done"
        message={t('dataExport.done')}
        onDone={clearExportDone}
      />
    ),
    exportDone ? 'export-done' : 'export-idle',
  )
  return (
    <>
      <RowList>
        <ListRow key="account" chevron title={profile?.name ?? t('profile.editName.title')} accessibilityLabel={t('profile.settingsRows.editName', { name: profile?.name ?? t('profile.editName.title'), email: profile?.email ?? '' })} description={profile?.email} onClick={() => setShowEditName(true)} />
        {/* eslint-disable-next-line local/max-button-words -- Canvas Orbit Perfil line 106 controls this label under D42. */}
        <ListRow key="export" compact={!exportError} icon={icon(Download)} title={t('profile.settingsRows.export')} value={isExporting ? t('dataExport.preparing') : undefined} description={exportError ?? undefined} chevron={false} onClick={() => void exportData()} />
        {analyticsEnabled === null ? null : (
          <SettingsRow
            icon={BarChart3}
            label={t('profile.analytics.title')}
            desc={analyticsSaveError ? t('profile.analytics.saveError') : undefined}
            accessory="none"
            divider={false}
          >
            <Switch checked={analyticsEnabled} onChange={onToggleAnalytics} label={t('profile.analytics.title')} />
            <span role="status" className="sr-only">
              {analyticsSaveError ? t('profile.analytics.saveError') : ''}
            </span>
          </SettingsRow>
        )}
        {/* eslint-disable-next-line local/max-button-words -- Canvas Orbit Perfil line 429 controls this label under D42. */}
        <ListRow key="fresh-start" compact icon={icon(RotateCcw)} title={t('profile.settingsRows.startOver')} chevron={false} onClick={() => setShowFreshStart(true)} />
        {/* eslint-disable-next-line local/max-button-words -- Canvas Orbit Perfil line 430 controls this label under D42. */}
        <ListRow key="delete" compact icon={icon(UserX)} title={t('profile.settingsRows.deleteAccount')} danger chevron={false} onClick={() => setShowDeleteAccount(true)} />
      </RowList>
      <EditNameSheet open={showEditName} onOpenChange={setShowEditName} />
      <FreshStartModal open={showFreshStart} onOpenChange={setShowFreshStart} />
      <DeleteAccountModal open={showDeleteAccount} onOpenChange={setShowDeleteAccount} profile={profile} />
    </>
  )
}
