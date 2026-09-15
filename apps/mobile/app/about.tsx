import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import Constants from 'expo-constants'
import { FeatureGuideDrawer } from '@/components/onboarding/feature-guide-drawer'
import { AppBar } from '@/components/ui/app-bar'
import { ListRow } from '@/components/ui/list-row'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { RowList } from '@/components/ui/row-list'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useProfile } from '@/hooks/use-profile'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useAuthStore } from '@/stores/auth-store'

interface AboutFactProps {
  id: 'version' | 'account'
  label: string
  value: string
  labelColor: string
  valueColor: string
}

function AboutFact({ id, label, value, labelColor, valueColor }: Readonly<AboutFactProps>) {
  return (
    <View testID={`about-fact-${id}`} style={styles.factRow}>
      <Text testID={`about-fact-${id}-label`} style={[styles.factLabel, { color: labelColor }]}>
        {label}
      </Text>
      <Text testID={`about-fact-${id}-value`} style={[styles.factValue, { color: valueColor }]}>
        {value}
      </Text>
    </View>
  )
}

function ProfileAccountFact({
  label,
  labelColor,
  valueColor,
}: Readonly<Pick<AboutFactProps, 'label' | 'labelColor' | 'valueColor'>>) {
  const { profile } = useProfile()

  return (
    <AboutFact
      id="account"
      label={label}
      labelColor={labelColor}
      value={profile?.email ?? ''}
      valueColor={valueColor}
    />
  )
}

export default function AboutScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
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
        onBack={() => goBackOrFallback('/profile')}
        title={t('about.title')}
        backLabel={t('common.backToProfile')}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View testID="about-content" style={styles.content}>
          <View testID="about-identity" style={styles.identity}>
            <OrbitMark size={48} accent />
            <Text accessibilityLanguage="en" style={[styles.appName, { color: tokens.fg1 }]}>
              {t('common.appName')}
            </Text>
            <Text style={[styles.tagline, { color: tokens.fg2 }]}>
              {t('about.tagline')}
            </Text>
          </View>

          <View testID="about-destinations" style={styles.destinations}>
            <RowList style={styles.rowList}>
              {/* eslint-disable-next-line local/max-button-words -- #74 owns this existing control copy. */}
              <ListRow
                accessibilityLabel={t('onboarding.featureGuide.openButton')}
                onClick={() => setShowGuide(true)}
                title={t('onboarding.featureGuide.openButton')}
                wrapTitle
              />
              <ListRow
                accessibilityLabel={t('profile.support.title')}
                onClick={() => router.push('/support')}
                title={t('profile.support.title')}
                wrapTitle
              />
              {/* eslint-disable-next-line local/max-button-words -- #74 owns this existing control copy. */}
              <ListRow
                accessibilityLabel={t('terms.title')}
                onClick={() => router.push('/terms')}
                title={t('terms.title')}
                wrapTitle
              />
              {/* eslint-disable-next-line local/max-button-words -- #74 owns this existing control copy. */}
              <ListRow
                accessibilityLabel={t('privacy.title')}
                onClick={() => router.push('/privacy')}
                title={t('privacy.title')}
                wrapTitle
              />
            </RowList>
          </View>

          <View testID="about-facts" style={styles.facts}>
            {appVersion ? (
              <AboutFact
                id="version"
                label={t('about.versionLabel')}
                labelColor={tokens.fg3}
                value={appVersion}
                valueColor={tokens.fg2}
              />
            ) : null}
            {isAuthenticated ? (
              <ProfileAccountFact
                label={t('about.accountLabel')}
                labelColor={tokens.fg3}
                valueColor={tokens.fg2}
              />
            ) : null}
          </View>

          <Text testID="about-credit" style={[styles.credit, { color: tokens.fg3 }]}>
            {t('about.credit')}
          </Text>
        </View>
      </ScrollView>

      <FeatureGuideDrawer open={showGuide} onClose={() => setShowGuide(false)} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, minWidth: 0 },
  container: { flex: 1, minWidth: 0 },
  scrollContent: { minWidth: 0 },
  content: { minWidth: 0, gap: 24, padding: 16, paddingBottom: 24 },
  identity: { minWidth: 0, alignItems: 'flex-start', gap: 12 },
  appName: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 32.2,
    letterSpacing: -0.56,
  },
  tagline: {
    maxWidth: '100%',
    fontFamily: 'Geist_400Regular',
    fontSize: 16,
    lineHeight: 24.8,
  },
  destinations: { minWidth: 0 },
  rowList: { minWidth: 0 },
  facts: { minWidth: 0, gap: 8 },
  factRow: {
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 4,
  },
  factLabel: {
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  factValue: {
    minWidth: 0,
    maxWidth: '100%',
    flexShrink: 1,
    fontFamily: 'GeistMono_400Regular',
    fontSize: 12,
    lineHeight: 19.2,
    fontVariant: ['tabular-nums'],
  },
  credit: {
    minWidth: 0,
    maxWidth: '100%',
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 21.7,
  },
})
