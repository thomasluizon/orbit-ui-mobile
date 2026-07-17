import { Linking, StyleSheet, Text, View } from 'react-native'
import Constants from 'expo-constants'
import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
import { i18n } from '@/lib/i18n'
import { createTokensV2, zLayers } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useVersionGateStore } from '@/stores/version-gate-store'

function openPlayListing(): void {
  const packageName = Constants.expoConfig?.android?.package
  const webUrl = packageName
    ? `https://play.google.com/store/apps/details?id=${packageName}`
    : 'https://play.google.com/store/apps/details?id=org.useorbit.app'
  const marketUrl = packageName ? `market://details?id=${packageName}` : webUrl

  void Linking.openURL(marketUrl).catch(() => {
    void Linking.openURL(webUrl).catch(() => {})
  })
}

/**
 * Full-screen, non-dismissible blocker shown when the server returns HTTP 426
 * (the installed app version is below the supported floor). An old native
 * binary cannot self-heal, so the only path forward is a store update. Copy
 * resolves through the i18n singleton; tokens come from useAppTheme so the
 * blocker tracks the active scheme and mode.
 */
export function UpgradeRequiredScreen() {
  const upgradeRequired = useVersionGateStore((s) => s.upgradeRequired)
  const { currentScheme, currentTheme } = useAppTheme()
  if (!upgradeRequired) return null

  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View style={[styles.root, { backgroundColor: tokens.bg }]}>
      <SatelliteGlyph size={96} />
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: tokens.fg1 }]}
      >
        {i18n.t('forceUpdate.title')}
      </Text>
      <Text style={[styles.description, { color: tokens.fg2 }]}>
        {i18n.t('forceUpdate.description')}
      </Text>
      <PillButton
        onPress={openPlayListing}
        accessibilityLabel={i18n.t('forceUpdate.cta')}
        style={styles.cta}
      >
        {i18n.t('forceUpdate.cta')}
      </PillButton>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: zLayers.modal,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingVertical: 64,
  },
  title: {
    marginTop: 18,
    fontFamily: 'Rubik_500Medium',
    fontSize: 22,
    lineHeight: 29,
    textAlign: 'center',
  },
  description: {
    marginTop: 10,
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    lineHeight: 25,
    textAlign: 'center',
  },
  cta: {
    marginTop: 24,
  },
})
