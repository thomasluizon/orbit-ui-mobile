import { SPACING } from '@orbit/shared/theme'
import type { EmptyStateProps } from '@orbit/shared/contracts/feedback'
import { StyleSheet, Text, View } from 'react-native'
import { OrbitMascot, useStateMascotSize } from '@/components/ui/orbit-mascot'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** A single-action invitation for an empty region. */
export function EmptyState({
  title,
  line,
  action,
  disclosure,
  mascotState = 'parado',
}: Readonly<EmptyStateProps>) {
  const mascotSize = useStateMascotSize()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View style={styles.container} testID="empty-state">
      <View testID="empty-state-mark">
        <OrbitMascot size={mascotSize} state={mascotState} />
      </View>
      {line ? <Text testID="empty-state-line" style={[styles.line, { color: tokens.fg2 }]}>{line}</Text> : null}
      <Text style={[styles.title, { color: tokens.fg1 }]} textBreakStrategy="balanced">{title}</Text>
      {action ? <View testID="empty-state-action">{action}</View> : null}
      {disclosure}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 24,
    paddingVertical: SPACING.s48,
    paddingHorizontal: SPACING.s24,
  },
  line: {
    maxWidth: 360,
    fontFamily: 'Geist_400Regular',
    fontSize: 16,
    lineHeight: 22.4,
    textAlign: 'center',
  },
  title: {
    fontFamily: 'Geist_500Medium',
    fontSize: 20,
    lineHeight: 28,
    textAlign: 'center',
  },
})
