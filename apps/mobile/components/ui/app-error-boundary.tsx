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
 * React context, so it renders even when the provider tree is what threw — which
 * is why it re-implements the shared EmptyState lockup (56px disc, base-4 gap
 * rhythm, secondary-role message) inline instead of importing it. Mirrors the
 * web route error boundaries, which render that lockup through EmptyState.
 */
export function AppErrorScreen({ error, retry }: Readonly<AppErrorScreenProps>) {
  const tokens = createTokensV2()
  const message =
    process.env.NODE_ENV === 'development' && error.message
      ? error.message
      : i18n.t('auth.genericError')

  return (
    <View style={[styles.root, { backgroundColor: tokens.bg }]}>
      <View style={[styles.iconDisc, { backgroundColor: tokens.bgField }]}>
        <AlertTriangle size={28} strokeWidth={1.4} color={tokens.fg3} />
      </View>
      <Text style={[styles.message, { color: tokens.fg2 }]}>{message}</Text>
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
    gap: 20,
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  iconDisc: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 22,
    maxWidth: 320,
    textAlign: 'center',
  },
  pill: {
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
