import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import Constants from 'expo-constants'
import { Compass, FileText, Mail, Shield } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { AppLogo } from '@/components/ui/app-logo'
import { FeatureGuideDrawer } from '@/components/onboarding/feature-guide-drawer'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useAppTheme } from '@/lib/use-app-theme'
import { AppBar } from '@/components/ui/app-bar'
import { SettingsRow } from '@/components/ui/settings-row'

function sectionEntrance(index: number) {
  return FadeInDown.duration(280)
    .delay(index * 50)
    .reduceMotion(ReduceMotion.System)
}

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
  const appVersion = Constants.expoConfig?.version

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: tokens.bg }]}
      edges={['top']}
    >
      <AppBar
        back
        onBack={() => goBackOrFallback('/profile')}
        title={t('about.title')}
        backLabel={t('common.backToProfile')}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={sectionEntrance(0)} style={styles.logoBlock}>
          <AppLogo size={72} />
          <Text style={[styles.appName, { color: tokens.fg1 }]}>
            {t('common.appName')}
          </Text>
          {appVersion ? (
            <Text style={[styles.appVersion, { color: tokens.fg3 }]}>
              {t('about.version', { version: appVersion })}
            </Text>
          ) : null}
        </Animated.View>
        <Animated.View entering={sectionEntrance(1)}>
          <SettingsRow
            icon={Compass}
            label={t('onboarding.featureGuide.openButton')}
            onPress={() => setShowGuide(true)}
          />
          <SettingsRow
            icon={Mail}
            label={t('profile.support.title')}
            onPress={() => router.push('/support')}
          />
          <SettingsRow
            icon={FileText}
            label={t('terms.title')}
            onPress={() => router.push('/terms')}
          />
          <SettingsRow
            icon={Shield}
            label={t('privacy.title')}
            onPress={() => router.push('/privacy')}
          />
        </Animated.View>
        <View style={{ height: 24 }} />
      </ScrollView>

      <FeatureGuideDrawer
        open={showGuide}
        onClose={() => setShowGuide(false)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  logoBlock: {
    alignItems: 'center',
    gap: 10,
    paddingTop: 24,
    paddingBottom: 20,
  },
  appName: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 22,
    letterSpacing: -0.22,
  },
  appVersion: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
})
