import { SPACING } from '@orbit/shared/theme'
import { StyleSheet, View } from 'react-native'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

const SHELL_SKELETON_ROWS = ['first', 'second', 'third'] as const

/** Covers the shell while the app prepares again after its first render: the content column's rows as one busy skeleton. */
export function ShellSkeleton() {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return (
    <View
      testID="shell-skeleton"
      pointerEvents="auto"
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: tokens.bg }]}
    >
      {SHELL_SKELETON_ROWS.map((row) => <Skeleton key={row} variant="habit-row" grouped />)}
    </View>
  )
}

const styles = StyleSheet.create({
  cover: { paddingHorizontal: SPACING.s16, paddingTop: SPACING.s64, gap: SPACING.s8 },
})
