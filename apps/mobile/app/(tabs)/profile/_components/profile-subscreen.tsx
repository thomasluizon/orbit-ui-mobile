import { ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useShellPageEnd } from '@/components/shell/shell-scroller-clearance'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import type { ProfileSubmenuId } from '@orbit/shared/utils/profile-navigation'
import { PROFILE_SUBMENUS } from '@orbit/shared/utils/profile-navigation'
import { ErrorState } from '@/components/ui/error-state'
import { PillButton } from '@/components/ui/pill-button'
import { PageHeader } from '@/components/ui/page-header'
import { useProfile } from '@/hooks/use-profile'
import { ProfileAccountContent } from './profile-account-content'
import { ProfilePreferencesContent } from './profile-preferences-content'
import { ProfileAstraContent } from './profile-astra-content'
import { ProfileNotificationsContent } from './profile-notifications-content'
import { Skeleton } from '@/components/ui/skeleton'

const CONTENT = {
  account: ProfileAccountContent,
  preferences: ProfilePreferencesContent,
  astra: ProfileAstraContent,
  notifications: ProfileNotificationsContent,
}

export function ProfileSubscreen({ screen }: Readonly<{ screen: ProfileSubmenuId }>) {
  const { t } = useTranslation()
  const router = useRouter()
  const pageEnd = useShellPageEnd()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { profile, isLoading, error, refetch, patchProfile } = useProfile()
  const submenu = PROFILE_SUBMENUS.find((entry) => entry.id === screen)!
  const Content = CONTENT[screen]
  return <SafeAreaView edges={pageEnd.safeAreaEdges} style={[styles.safeArea, { backgroundColor: tokens.bg }]}>
    <PageHeader title={t(submenu.labelKey)} backLabel={t('common.backToProfile')} onBack={() => router.dismissTo('/profile')} />
    <ScrollView testID={`profile-settings-group-${screen}`} style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: pageEnd.paddingBottom }]}>
      {isLoading ? <Skeleton variant="settings" rows={8} label={t('profile.loading')} /> : error ? <ErrorState message={t('errors.loadProfile')} action={<PillButton variant="ghost" onClick={() => void refetch()}>{t('common.retry')}</PillButton>} /> : <Content profile={profile} patchProfile={patchProfile} />}
    </ScrollView>
  </SafeAreaView>
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, minWidth: 0 },
  container: { flex: 1, minWidth: 0 },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 16, gap: 12 },
})
