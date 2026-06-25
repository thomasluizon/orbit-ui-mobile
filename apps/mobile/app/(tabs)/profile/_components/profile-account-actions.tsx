import { StyleSheet, Text } from 'react-native'
import { Download, LogOut, RotateCcw, UserX } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { SectionLabel } from '@/components/ui/section-label'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { ProfileActionButton } from './profile-action-button'

interface ProfileAccountActionsProps {
  isExporting: boolean
  exportError: string
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
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <>
      <SectionLabel>{t('profile.sections.accountActions')}</SectionLabel>
      <ProfileActionButton
        icon={Download}
        onPress={onExport}
        label={isExporting ? t('dataExport.preparing') : t('dataExport.button')}
      />
      {exportError ? (
        <Text style={[styles.errorText, { color: tokens.statusBad }]}>
          {exportError}
        </Text>
      ) : null}
      <ProfileActionButton
        icon={RotateCcw}
        onPress={onFreshStart}
        label={t('profile.freshStart.button')}
      />
      <ProfileActionButton
        icon={UserX}
        onPress={onDeleteAccount}
        label={t('profile.deleteAccount.button')}
        tone="danger"
      />
      <ProfileActionButton
        icon={LogOut}
        onPress={onLogout}
        label={t('profile.logout')}
      />
    </>
  )
}

const styles = StyleSheet.create({
  errorText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 12,
  },
})
