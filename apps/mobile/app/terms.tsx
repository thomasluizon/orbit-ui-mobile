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

export default function TermsScreen() {
  const goBackOrFallback = useGoBackOrFallback()
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  const subscriptionKeys = ['intro', 'autoRenew', 'cancel', 'refunds'] as const

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: tokens.bg }]}
      edges={['top']}
    >
      <AppBar
        back
        onBack={() => goBackOrFallback(isAuthenticated ? '/' : '/login')}
        title={t('terms.title')}
        subtitle={t('terms.lastUpdated')}
        backLabel={t('common.goBack')}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <SectionLabel>{t('terms.intro.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('terms.intro.body')}
          </Text>
        </View>

        <SectionLabel>{t('terms.provider.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('terms.provider.body')}
          </Text>
        </View>

        <SectionLabel>{t('terms.eligibility.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('terms.eligibility.body')}
          </Text>
        </View>

        <SectionLabel>{t('terms.license.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('terms.license.body')}
          </Text>
        </View>

        <SectionLabel>{t('terms.subscription.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          {subscriptionKeys.map((key) => (
            <Text key={key} style={[styles.bodyText, { color: tokens.fg2 }]}>
              {t(`terms.subscription.${key}`)}
            </Text>
          ))}
        </View>

        <SectionLabel>{t('terms.ai.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('terms.ai.body')}
          </Text>
        </View>

        <SectionLabel>{t('terms.noMedicalAdvice.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('terms.noMedicalAdvice.body')}
          </Text>
        </View>

        <SectionLabel>{t('terms.warranty.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('terms.warranty.body')}
          </Text>
        </View>

        <SectionLabel>{t('terms.liability.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('terms.liability.body')}
          </Text>
        </View>

        <SectionLabel>{t('terms.termination.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('terms.termination.body')}
          </Text>
        </View>

        <SectionLabel>{t('terms.governingLaw.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('terms.governingLaw.body')}
          </Text>
        </View>

        <SectionLabel>{t('terms.changes.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('terms.changes.body')}
          </Text>
        </View>

        <SectionLabel>{t('terms.contact.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('terms.contact.body')}
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
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 22,
  },
})
