'use client'

import { Download, LogOut, RotateCcw, UserX } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SectionLabel } from '@/components/ui/section-label'
import { ProfileActionButton } from './profile-action-button'

interface ProfileAccountActionsProps {
  isExporting: boolean
  exportError: string | null
  onExport: () => void
  onFreshStart: () => void
  onDeleteAccount: () => void
  onLogout: () => void
}

export function ProfileAccountActions({
  isExporting,
  exportError,
  onExport,
  onFreshStart,
  onDeleteAccount,
  onLogout,
}: Readonly<ProfileAccountActionsProps>) {
  const t = useTranslations()

  return (
    <div>
      <SectionLabel>{t('profile.sections.accountActions')}</SectionLabel>
      <ProfileActionButton
        icon={Download}
        onClick={onExport}
        label={isExporting ? t('dataExport.preparing') : t('dataExport.button')}
      />
      {exportError && (
        <p
          style={{
            margin: '0 20px 8px',
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            color: 'var(--status-bad)',
          }}
        >
          {exportError}
        </p>
      )}
      <ProfileActionButton
        icon={RotateCcw}
        onClick={onFreshStart}
        label={t('profile.freshStart.button')}
      />
      <ProfileActionButton
        icon={UserX}
        onClick={onDeleteAccount}
        label={t('profile.deleteAccount.button')}
        tone="danger"
      />
      <ProfileActionButton
        icon={LogOut}
        onClick={onLogout}
        label={t('profile.logout')}
      />
    </div>
  )
}
