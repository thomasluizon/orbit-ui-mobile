import type { ErrorStateProps } from '@orbit/shared/contracts/feedback'
import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** A data-surface failure stated in the caller's words, with one optional text action. */
export function ErrorState({ message, action }: Readonly<ErrorStateProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View style={styles.container} testID="error-state">
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
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  message: {
    fontFamily: 'Geist_400Regular',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
})
