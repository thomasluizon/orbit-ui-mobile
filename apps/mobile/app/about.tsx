import { useContentFrameStyle } from '@/hooks/use-content-frame-style'
import { ChevronDown } from '@/components/ui/icons'
import { PersonalText } from '@/components/ui/personal-text'
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { ABOUT_DESTINATIONS } from '@orbit/shared/utils'
import { getAppVersion } from '@/lib/app-version'
import { FeatureGuideDrawer } from '@/components/onboarding/feature-guide-drawer'
import { useShellPageEnd } from '@/components/shell/shell-scroller-clearance'
import { PageHeader } from '@/components/ui/page-header'
import { ListRow } from '@/components/ui/list-row'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { RowList } from '@/components/ui/row-list'
import { useBackLabel } from '@/hooks/use-back-label'
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
  if (id === 'account') return <AboutAccountFact label={label} value={value} labelColor={labelColor} valueColor={valueColor} />
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

function AboutAccountFact({ label, value, labelColor, valueColor }: Readonly<Omit<AboutFactProps, 'id'>>) {
  const [expanded, setExpanded] = useState(false)
  const [pressed, setPressed] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const highlighted = pressed || focused || hovered
  return <Pressable
    onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)}
    accessibilityRole="button" accessibilityLabel={`${label} ${value}`} accessibilityState={{ expanded }}
    onPress={() => setExpanded(!expanded)} hitSlop={{ left: 16, right: 16 }}
    testID="about-fact-account" style={[styles.factRow, styles.accountRow]}>
    <View testID="about-account-fill" pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
      style={[styles.accountFill, { backgroundColor: highlighted ? tokens.bgHover : 'transparent', outlineWidth: focused ? 2 : 0, outlineColor: tokens.fg1, outlineOffset: -2, outlineStyle: 'solid' }]} />
    <Text testID="about-fact-account-label" style={[styles.factLabel, { color: highlighted ? tokens.fg2 : labelColor }]}>{label}</Text>
    <View style={styles.accountValue}>
      <PersonalText expanded={expanded} testID="about-fact-account-value" style={[styles.factValue, { color: valueColor }]}>{value}</PersonalText>
      <ChevronDown size={20} strokeWidth={1.5} color={highlighted ? tokens.fg2 : labelColor} accessible={false} style={expanded ? { transform: [{ rotate: '180deg' }] } : undefined} />
    </View>
  </Pressable>
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
  const { width } = useWindowDimensions()
  const contentFrameStyle = useContentFrameStyle(620)
  const { t } = useTranslation()
  const pageEnd = useShellPageEnd()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const backLabel = useBackLabel('/profile')
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const [showGuide, setShowGuide] = useState(false)
  const appVersion = getAppVersion()

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: tokens.bg }]}
      edges={pageEnd.safeAreaEdges}
    >
      <PageHeader
        onBack={() => goBackOrFallback('/profile')}
        title={t('about.title')}
        backLabel={backLabel}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: pageEnd.paddingBottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View testID="about-content" style={[contentFrameStyle, styles.content]}>
          <View testID="about-identity" style={styles.identity}>
            <OrbitMark size={48} accent />
            <Text accessibilityLanguage="en" style={[styles.appName, width >= 768 && styles.appNameWide, { color: tokens.fg1 }]}>
              {t('common.appName')}
            </Text>
            <Text style={[styles.tagline, { color: tokens.fg2 }]}>
              {t('about.tagline')}
            </Text>
          </View>

          <View testID="about-destinations" style={styles.destinations}>
            <RowList style={styles.rowList}>
              {ABOUT_DESTINATIONS.map((destination) => (
                <ListRow
                  key={destination.id}
                  accessibilityLabel={t(destination.titleKey)}
                  onClick={() => destination.route ? router.push(destination.route) : setShowGuide(true)}
                  title={t(destination.titleKey)}
                  compact
                  wrapTitle
                />
              ))}
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
  content: { gap: 24, paddingTop: 16 },
  identity: { minWidth: 0, alignItems: 'flex-start', gap: 12 },
  appName: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 32.2,
    letterSpacing: -0.56,
  },
  appNameWide: { fontSize: 34, lineHeight: 38.08, letterSpacing: -0.68 },
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
  accountRow: { minHeight: 48, paddingVertical: 8, position: 'relative', alignItems: 'center' },
  accountFill: { position: 'absolute', top: 0, bottom: 0, left: -16, right: -16, borderRadius: 12 },
  accountValue: { minWidth: 0, maxWidth: '100%', flexShrink: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
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
})
