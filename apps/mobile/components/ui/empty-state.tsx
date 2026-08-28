import type { EmptyStateProps } from '@orbit/shared/contracts/feedback'
import { StyleSheet, Text, View } from 'react-native'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** A single-action invitation for an empty region. */
export function EmptyState({
  title,
  mark = 'orbit',
  action,
}: Readonly<EmptyStateProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View style={styles.container} testID="empty-state">
      <View testID={`empty-state-mark-${mark}`}>
        {mark === 'astra' ? <AstraGlyph size={96} /> : <OrbitMark size={96} />}
      </View>
      <Text style={[styles.title, { color: tokens.fg1 }]}>{title}</Text>
      {action ? <View testID="empty-state-action">{action}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 24,
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  title: {
    fontFamily: 'Geist_500Medium',
    fontSize: 20,
    textAlign: 'center',
  },
})
