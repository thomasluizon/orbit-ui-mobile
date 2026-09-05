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

function PrivacyBulletList({
  lines,
  color,
}: Readonly<{ lines: readonly string[]; color: string }>) {
  return (
    <>
      {lines.map((line) => (
        <Text key={line} style={[styles.bodyText, { color }]}>
          {`• ${line}`}
        </Text>
      ))}
    </>
  )
}

export default function PrivacyScreen() {
  const goBackOrFallback = useGoBackOrFallback()
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: tokens.bg }]}
      edges={['top']}
    >
      <AppBar onBack={() => goBackOrFallback(isAuthenticated ? '/' : '/login')}
title={t('privacy.title')}
backLabel={t(isAuthenticated ? 'common.backToToday' : 'auth.backToLogin')} />
      <Text style={{ paddingHorizontal: 16, color: tokens.fg3 }}>{t('privacy.lastUpdated')}</Text>
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

        <SectionLabel>{t('privacy.controller.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('privacy.controller.body')}
          </Text>
        </View>

        <SectionLabel>{t('privacy.dataCollected.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <PrivacyBulletList
            lines={[
              t('privacy.dataCollected.account'),
              t('privacy.dataCollected.habits'),
              t('privacy.dataCollected.chat'),
              t('privacy.dataCollected.preferences'),
              t('privacy.dataCollected.device'),
            ]}
            color={tokens.fg2}
          />
        </View>

        <SectionLabel>{t('privacy.howWeUse.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <PrivacyBulletList
            lines={[
              t('privacy.howWeUse.provide'),
              t('privacy.howWeUse.personalize'),
              t('privacy.howWeUse.notifications'),
            ]}
            color={tokens.fg2}
          />
        </View>

        <SectionLabel>{t('privacy.thirdParty.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('privacy.thirdParty.intro')}
          </Text>
          <PrivacyBulletList
            lines={[
              t('privacy.thirdParty.google'),
              t('privacy.thirdParty.stripe'),
              t('privacy.thirdParty.firebase'),
              t('privacy.thirdParty.openai'),
              t('privacy.thirdParty.resend'),
              t('privacy.thirdParty.googlePlay'),
              t('privacy.thirdParty.admob'),
              t('privacy.thirdParty.sentry'),
              t('privacy.thirdParty.posthog'),
              t('privacy.thirdParty.vercel'),
            ]}
            color={tokens.fg2}
          />
        </View>

        <SectionLabel>{t('privacy.retention.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('privacy.retention.intro')}
          </Text>
          <PrivacyBulletList
            lines={[
              t('privacy.retention.account'),
              t('privacy.retention.sessions'),
              t('privacy.retention.ai'),
              t('privacy.retention.reminderHistory'),
              t('privacy.retention.syncRecords'),
              t('privacy.retention.calendarSuggestions'),
              t('privacy.retention.billingRecords'),
              t('privacy.retention.afterDeletion'),
            ]}
            color={tokens.fg2}
          />
        </View>

        <SectionLabel>{t('privacy.googleScopes.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('privacy.googleScopes.intro')}
          </Text>
          <PrivacyBulletList
            lines={[
              t('privacy.googleScopes.auth'),
              t('privacy.googleScopes.calendar'),
              t('privacy.googleScopes.control'),
            ]}
            color={tokens.fg2}
          />
        </View>

        <SectionLabel>{t('privacy.dataResidency.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('privacy.dataResidency.body')}
          </Text>
        </View>

        <SectionLabel>{t('privacy.automatedProcessing.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('privacy.automatedProcessing.body')}
          </Text>
        </View>

        <SectionLabel>{t('privacy.minors.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('privacy.minors.body')}
          </Text>
        </View>

        <SectionLabel>{t('privacy.export.title')}</SectionLabel>
        <View style={styles.bodyBlock}>
          <Text style={[styles.bodyText, { color: tokens.fg2 }]}>
            {t('privacy.export.body')}
          </Text>
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
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 22,
  },
})
