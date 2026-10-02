import { useEffect, useMemo } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useShellScrollerClearance } from '@/components/shell/shell-scroller-clearance'
import { ScreenReaderHeading } from '@/components/ui/screen-reader-heading'
import { useProfile } from '@/hooks/use-profile'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { createProfileStyles } from './profile/_components/profile-styles'
import { ProfileSettingsContent } from './profile/_components/profile-settings-content'

export default function ProfileScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { subscription } = useLocalSearchParams<{ subscription?: string }>()
  useEffect(() => {
    if (subscription === 'success') router.replace('/profile/astra?subscription=success')
  }, [router, subscription])
  const clearance = useShellScrollerClearance()
  const { profile, isLoading, error, patchProfile } = useProfile()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createProfileStyles(), [])

  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={[styles.safeArea, { backgroundColor: tokens.bg }]}
    >
      <ScreenReaderHeading title={t('nav.profile')} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: clearance }]}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View style={styles.errorBlock}>
            <Text style={[styles.errorText, { color: tokens.statusBadText }]}>
              {__DEV__ && error instanceof Error
                ? error.message
                : t('errors.loadProfile')}
            </Text>
          </View>
        ) : null}
        <ProfileSettingsContent
          profile={profile}
          isLoading={isLoading}
          patchProfile={patchProfile}
        />
      </ScrollView>
    </SafeAreaView>
  )
}
