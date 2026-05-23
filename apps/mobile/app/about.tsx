import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { createTokensV2 } from '@/lib/theme'
import { FeatureGuideDrawer } from '@/components/onboarding/feature-guide-drawer'
import { ReferralCard } from '@/components/referral/referral-card'
import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useAppTheme } from '@/lib/use-app-theme'
import { AppBar } from '@/components/ui/app-bar'
import { SettingsRow } from '@/components/ui/settings-row'

export default function AboutScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const [showGuide, setShowGuide] = useState(false)
  const [showReferral, setShowReferral] = useState(false)

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: tokens.bg }]}
      edges={['top']}
    >
      <AppBar
        back
        onBack={() => goBackOrFallback('/profile')}
        title={t('about.title')}
        backLabel={t('common.goBack')}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <SettingsRow
          label={t('onboarding.featureGuide.openButton')}
          onPress={() => setShowGuide(true)}
        />
        <View>
          <ReferralCard onOpen={() => setShowReferral(true)} />
        </View>
        <SettingsRow
          label={t('profile.support.title')}
          onPress={() => router.push('/support')}
        />
        <SettingsRow
          label={t('privacy.title')}
          onPress={() => router.push('/privacy')}
        />
        <View style={{ height: 24 }} />
      </ScrollView>

      <FeatureGuideDrawer
        open={showGuide}
        onClose={() => setShowGuide(false)}
      />
      <ReferralDrawer
        open={showReferral}
        onClose={() => setShowReferral(false)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
})
