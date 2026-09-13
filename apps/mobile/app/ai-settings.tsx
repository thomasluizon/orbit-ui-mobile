import { useMemo } from 'react'
import { View, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { useProfile } from '@/hooks/use-profile'
import { useAstraSettingsController } from '@/components/profile/astra-settings-controller'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { AppBar } from '@/components/ui/app-bar'
import { createStyles } from './ai-settings-styles'
import { AiFeatureToggles } from '@/components/profile/ai-settings-sections'

export default function AiSettingsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const { profile, patchProfile } = useProfile()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(), [])
  const hasProAccess = profile?.hasProAccess ?? false
  const astraSettings = useAstraSettingsController(profile, patchProfile)

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: tokens.bg }]}
      edges={['top']}
    >
      <AppBar
        onBack={() => goBackOrFallback('/profile')}
        title={t('aiSettings.title')}
        backLabel={t('common.backToProfile')}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <AiFeatureToggles
          tokens={tokens}
          t={t}
          hasProAccess={hasProAccess}
          {...astraSettings}
          onUpgrade={() => router.push(buildUpgradeHref('/ai-settings'))}
        />
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  )
}
