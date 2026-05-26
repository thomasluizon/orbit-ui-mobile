import { useMemo } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { createTokensV2 } from '@/lib/theme'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useAppTheme } from '@/lib/use-app-theme'
import { useAuthStore } from '@/stores/auth-store'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'

export default function PrivacyScreen() {
  const goBackOrFallback = useGoBackOrFallback()
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  const dataCollectedKeys = ['account', 'habits', 'chat', 'preferences'] as const
  const howWeUseKeys = ['provide', 'personalize', 'notifications'] as const
  const thirdPartyKeys = [
    'google',
    'stripe',
    'firebase',
    'openai',
    'resend',
  ] as const

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: tokens.bg }]}
      edges={['top']}
    >
      <AppBar
        back
        onBack={() => goBackOrFallback(isAuthenticated ? '/' : '/login')}
        title={t('privacy.title')}
        subtitle={t('privacy.lastUpdated')}
        backLabel={t('common.goBack')}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <SectionLabel>{t('privacy.intro.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('privacy.intro.body')}
          </Text>
        </View>

        <SectionLabel>{t('privacy.dataCollected.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          {dataCollectedKeys.map((key) => (
            <Text
              key={key}
              style={[styles.bodyText, { color: tokens.fg2 }]}
            >
              {`• ${t(`privacy.dataCollected.${key}`)}`}
            </Text>
          ))}
        </View>

        <SectionLabel>{t('privacy.howWeUse.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          {howWeUseKeys.map((key) => (
            <Text
              key={key}
              style={[styles.bodyText, { color: tokens.fg2 }]}
            >
              {`• ${t(`privacy.howWeUse.${key}`)}`}
            </Text>
          ))}
        </View>

        <SectionLabel>{t('privacy.thirdParty.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('privacy.thirdParty.intro')}
          </Text>
          {thirdPartyKeys.map((key) => (
            <Text
              key={key}
              style={[styles.bodyText, { color: tokens.fg2 }]}
            >
              {`• ${t(`privacy.thirdParty.${key}`)}`}
            </Text>
          ))}
        </View>

        <SectionLabel>{t('privacy.noSell.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('privacy.noSell.body')}
          </Text>
        </View>

        <SectionLabel>{t('privacy.security.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('privacy.security.body')}
          </Text>
        </View>

        <SectionLabel>{t('privacy.deletion.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('privacy.deletion.body')}
          </Text>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('privacy.deletion.step1')}
          </Text>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('privacy.deletion.step2')}
          </Text>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('privacy.deletion.step3')}
          </Text>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('privacy.deletion.step4')}
          </Text>
        </View>

        <SectionLabel>{t('privacy.contact.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('privacy.contact.body')}
          </Text>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  bodyBlock: {
    paddingHorizontal: 20,
    paddingBottom: 18,
    gap: 6,
  },
  bodyText: {
    fontFamily: 'Geist',
    fontSize: 14,
    lineHeight: 22,
  },
})
