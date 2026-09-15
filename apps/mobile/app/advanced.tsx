import { useMemo, useState } from 'react'
import { ScrollView } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { WidgetInfoSheet } from '@/components/profile/advanced-sections'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { Smartphone } from '@/components/ui/icons'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { styles } from './advanced-styles'

export default function AdvancedScreen() {
  const { t } = useTranslation()
  const goBackOrFallback = useGoBackOrFallback()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const [showWidgetInfo, setShowWidgetInfo] = useState(false)

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: tokens.bg }]} edges={['top']}>
      <AppBar
        onBack={() => goBackOrFallback('/profile')}
        title={t('advancedSettings.title')}
        backLabel={t('common.backToProfile')}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(280).reduceMotion(ReduceMotion.System)}>
          <SectionLabel>{t('advancedSettings.widgetSection')}</SectionLabel>
          <SettingsRow
            label={t('profile.widgetTitle')}
            desc={t('profile.widgetHint')}
            icon={Smartphone}
            onPress={() => setShowWidgetInfo(true)}
            accessory="chevron"
            divider={false}
          />
        </Animated.View>
      </ScrollView>
      <WidgetInfoSheet
        open={showWidgetInfo}
        onClose={() => setShowWidgetInfo(false)}
        t={t}
        tokens={tokens}
      />
    </SafeAreaView>
  )
}
