'use client'

import { Download, LogOut, RotateCcw, UserX } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsGroup } from '@/components/ui/settings-group'
import { ShareCardEntryButton } from '@/components/share/share-card-entry-button'
import { ProfileActionButton } from './profile-action-button'

interface ProfileAccountActionsProps {
  isExporting: boolean
  exportError: string | null
  displayName?: string
  onExport: () => void
  onFreshStart: () => void
  onDeleteAccount: () => void
  onLogout: () => void
}

export function ProfileAccountActions({
  isExporting,
  exportError,
  displayName,
  onExport,
  onFreshStart,
  onDeleteAccount,
  onLogout,
}: Readonly<ProfileAccountActionsProps>) {
  const t = useTranslations()

  return (
    <div>
      <SectionLabel>{t('profile.sections.accountActions')}</SectionLabel>
      <SettingsGroup>
        <ShareCardEntryButton variant="row" displayName={displayName} />
        <ProfileActionButton
          icon={Download}
          onClick={onExport}
          label={isExporting ? t('dataExport.preparing') : t('dataExport.button')}
        />
      </SettingsGroup>
      {exportError && (
        <p
          style={{
            margin: '12px 20px',
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            textAlign: 'center',
            color: 'var(--status-bad-text)',
          }}
        >
          {exportError}
        </p>
      )}
      <div style={{ marginTop: 8 }}>
        <SettingsGroup>
          <ProfileActionButton
            icon={RotateCcw}
            onClick={onFreshStart}
            label={t('profile.freshStart.button')}
            dataTestId="profile-fresh-start"
          />
          <ProfileActionButton
            icon={UserX}
            onClick={onDeleteAccount}
            label={t('profile.deleteAccount.button')}
            tone="danger"
            dataTestId="profile-delete-account"
          />
          <ProfileActionButton
            icon={LogOut}
            onClick={onLogout}
            label={t('profile.logout')}
          />
        </SettingsGroup>
      </div>
    </div>
  )
}
