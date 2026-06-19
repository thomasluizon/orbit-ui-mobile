import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import Constants from 'expo-constants'
import { ArrowUpCircle } from 'lucide-react-native'
import { i18n } from '@/lib/i18n'
import { createTokensV2, primaryGlow, radius } from '@/lib/theme'
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
 * binary cannot self-heal, so the only path forward is a store update. Resolves
 * tokens + copy from singletons so it renders above the app at the root.
 */
export function UpgradeRequiredScreen() {
  const upgradeRequired = useVersionGateStore((s) => s.upgradeRequired)
  if (!upgradeRequired) return null

  const tokens = createTokensV2()

  return (
    <View style={[styles.root, { backgroundColor: tokens.bg }]}>
      <View
        style={[
          styles.orb,
          { backgroundColor: tokens.bgField, borderColor: tokens.hairline },
        ]}
      >
        <ArrowUpCircle size={34} strokeWidth={1.8} color={tokens.primary} />
      </View>
      <Text style={[styles.title, { color: tokens.fg1 }]}>
        {i18n.t('forceUpdate.title')}
      </Text>
      <Text style={[styles.description, { color: tokens.fg2 }]}>
        {i18n.t('forceUpdate.description')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={i18n.t('forceUpdate.cta')}
        onPress={openPlayListing}
        style={({ pressed }) => [
          styles.pill,
          primaryGlow(tokens),
          {
            backgroundColor: tokens.primary,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <Text style={[styles.pillLabel, { color: tokens.fgOnPrimary }]}>
          {i18n.t('forceUpdate.cta')}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingVertical: 64,
  },
  orb: {
    width: 80,
    height: 80,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  pill: {
    marginTop: 24,
    minHeight: 52,
    paddingHorizontal: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLabel: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
  },
})
