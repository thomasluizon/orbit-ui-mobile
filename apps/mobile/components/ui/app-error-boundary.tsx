import { Pressable, StyleSheet, Text, View } from 'react-native'
import { AlertTriangle } from '@/components/ui/icons'
import { i18n } from '@/lib/i18n'
import { createTokensV2, radius } from '@/lib/theme'

interface AppErrorScreenProps {
  error: Error
  retry: () => void
}

/**
 * Self-contained render-error fallback for the Expo Router root ErrorBoundary.
 * Resolves tokens + copy from singletons (createTokensV2 / i18n) rather than
 * React context, so it renders even when the provider tree is what threw.
 * Mirrors the web (app)/error.tsx alert-orb + retry layout.
 */
export function AppErrorScreen({ error, retry }: Readonly<AppErrorScreenProps>) {
  const tokens = createTokensV2()
  const message =
    process.env.NODE_ENV === 'development' && error.message
      ? error.message
      : i18n.t('auth.genericError')

  return (
    <View style={[styles.root, { backgroundColor: tokens.bg }]}>
      <View
        style={[
          styles.orb,
          { backgroundColor: tokens.bgField, borderColor: tokens.hairline },
        ]}
      >
        <AlertTriangle size={34} strokeWidth={1.8} color={tokens.fg3} />
      </View>
      <Text style={[styles.message, { color: tokens.fg1 }]}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={i18n.t('common.retry')}
        onPress={retry}
        style={({ pressed }) => [
          styles.pill,
          {
            backgroundColor: tokens.primary,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <Text style={[styles.pillLabel, { color: tokens.fgOnPrimary }]}>
          {i18n.t('common.retry')}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
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
  message: {
    marginTop: 18,
    fontFamily: 'Rubik_500Medium',
    fontSize: 22,
    lineHeight: 29,
    textAlign: 'center',
  },
  pill: {
    marginTop: 22,
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
