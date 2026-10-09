import { useShellNoticeSlot } from '@/hooks/use-shell-notice-slot'
import { ListRow } from '@/components/ui/list-row'
import { SettingsRow } from '@/components/ui/settings-row'
import { Switch } from '@/components/ui/switch'
import { Toast } from '@/components/ui/app-toast'
import { DeleteAccountModal } from './delete-account-modal'
import { EditNameSheet } from './edit-name-sheet'
import { FreshStartModal } from './fresh-start-modal'
import { useDataExport } from './use-data-export'
import { getAnalyticsOptOut, setAnalyticsOptOut } from '@/lib/posthog'

import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo } from 'react-native'
import { BarChart3, Download, RotateCcw, Trash2 } from '@/components/ui/icons'
import { RowList } from '@/components/ui/row-list'
import { ProfileNavIcon } from '@/components/profile/profile-nav-icon'
import type { Profile } from '@orbit/shared/types/profile'
import { useTranslation } from 'react-i18next'

interface ProfileContentProps {
  profile: Profile | undefined
  patchProfile: (patch: Partial<Profile>) => void
}

const icon = (IconComponent: typeof Download) => <IconComponent size={24} strokeWidth={1.8} />

export function ProfileAccountContent({ profile }: Readonly<ProfileContentProps>) {
  const { t } = useTranslation()
  const {
    isExporting,
    exportDone,
    exportError,
    exportData,
    clearExportDone,
  } = useDataExport()
  const [showEditName, setShowEditName] = useState(false)
  const [showFreshStart, setShowFreshStart] = useState(false)
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const [analyticsEnabled, setAnalyticsEnabled] = useState<boolean | null>(null)
  const [analyticsSaveError, setAnalyticsSaveError] = useState(false)
  const analyticsChange = useRef(0)
  useEffect(() => {
    void getAnalyticsOptOut().then((optedOut) => {
      if (analyticsChange.current === 0) setAnalyticsEnabled(!optedOut)
    })
  }, [])
  const onToggleAnalytics = (next: boolean) => {
    const change = ++analyticsChange.current
    setAnalyticsEnabled(next)
    setAnalyticsSaveError(false)
    void setAnalyticsOptOut(!next).catch(() => {
      if (change !== analyticsChange.current) return
      void getAnalyticsOptOut().then((optedOut) => setAnalyticsEnabled(!optedOut))
      setAnalyticsSaveError(true)
      AccessibilityInfo.announceForAccessibility(t('profile.analytics.saveError'))
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
        <ListRow key="account" icon={<ProfileNavIcon iconKey="account" />} textMode="personal" personalExpanded wrapTitle title={profile?.name ?? t('profile.editName.title')} accessibilityLabel={t('profile.settingsRows.editName', { name: profile?.name ?? t('profile.editName.title'), email: profile?.email ?? '' })} description={profile?.email} onClick={() => setShowEditName(true)} />
        {/* eslint-disable-next-line local/max-button-words -- Canvas Orbit Perfil line 106 controls this label under D42. */}
        <ListRow key="export" compact={!exportError} icon={icon(Download)} title={t('profile.settingsRows.export')} value={isExporting ? t('dataExport.preparing') : undefined} description={exportError || undefined} onClick={() => void exportData()} />
        {analyticsEnabled === null ? null : (
          <SettingsRow
            icon={BarChart3}
            label={t('profile.analytics.title')}
            desc={analyticsSaveError ? t('profile.analytics.saveError') : undefined}
            accessory="none"
            divider={false}
          >
            <Switch checked={analyticsEnabled} onChange={onToggleAnalytics} label={t('profile.analytics.title')} />
          </SettingsRow>
        )}
        {/* eslint-disable-next-line local/max-button-words -- Canvas Orbit Perfil line 429 controls this label under D42. */}
        <ListRow key="fresh-start" compact icon={icon(RotateCcw)} title={t('profile.settingsRows.startOver')} onClick={() => setShowFreshStart(true)} />
        {/* eslint-disable-next-line local/max-button-words -- Canvas Orbit Perfil line 430 controls this label under D42. */}
        <ListRow key="delete" compact icon={icon(Trash2)} title={t('profile.settingsRows.deleteAccount')} danger onClick={() => setShowDeleteAccount(true)} />
      </RowList>
      <EditNameSheet open={showEditName} onClose={() => setShowEditName(false)} />
      <FreshStartModal open={showFreshStart} onClose={() => setShowFreshStart(false)} />
      <DeleteAccountModal open={showDeleteAccount} onClose={() => setShowDeleteAccount(false)} profile={profile} />
    </>
  )
}
