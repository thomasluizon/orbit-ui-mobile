import { SPACING } from '@orbit/shared/theme'
import type { ErrorStateProps } from '@orbit/shared/contracts/feedback'
import { StyleSheet, Text, View } from 'react-native'
import { OrbitMascot, useStateMascotSize } from '@/components/ui/orbit-mascot'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

function FullSurfaceMascot() {
  return <OrbitMascot size={useStateMascotSize()} />
}

/** A data-surface failure stated in the caller's words, with one optional text action. A full-surface error carries Orbit in Parado. */
export function ErrorState({ message, action, fullSurface = false }: Readonly<ErrorStateProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View style={styles.container} testID="error-state">
      {fullSurface ? <FullSurfaceMascot /> : null}
      <Text
        accessible
        accessibilityLabel={message}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[styles.message, { color: tokens.fg1 }]}
      >
        {message}
      </Text>
      {action ? <View testID="error-state-action">{action}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 16,
    paddingVertical: SPACING.s48,
    paddingHorizontal: SPACING.s24,
  },
  message: {
    fontFamily: 'Geist_400Regular',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
})
