import { StyleSheet, Text, View } from 'react-native'
import { Download, LogOut, RotateCcw, UserX } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsGroup } from '@/components/ui/settings-group'
import { ShareCardEntryButton } from '@/components/share/share-card-entry-button'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { ProfileActionButton } from './profile-action-button'

interface ProfileAccountActionsProps {
  isExporting: boolean
  exportError: string
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
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <>
      <SectionLabel>{t('profile.sections.accountActions')}</SectionLabel>
      <SettingsGroup>
        <ShareCardEntryButton variant="row" displayName={displayName} />
        <ProfileActionButton
          icon={Download}
          onPress={onExport}
          label={isExporting ? t('dataExport.preparing') : t('dataExport.button')}
        />
      </SettingsGroup>
      {exportError ? (
        <Text style={[styles.errorText, { color: tokens.statusBadText }]}>
          {exportError}
        </Text>
      ) : null}
      <View style={styles.destructiveGroup}>
        <SettingsGroup>
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
        </SettingsGroup>
      </View>
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
  destructiveGroup: {
    marginTop: 8,
  },
})
