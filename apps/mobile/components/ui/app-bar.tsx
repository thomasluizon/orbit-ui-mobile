import type { NavHeaderProps } from '@orbit/shared/contracts/navigation'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronLeft } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function AppBar({ title, onBack, backLabel, action }: Readonly<NavHeaderProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return (
    <View testID={onBack ? 'nav-header-back' : 'nav-header-plain'} style={styles.row}>
      <View style={styles.leading}>
        {onBack && (
          <Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={onBack}
            style={({ pressed }) => [styles.back, { backgroundColor: pressed ? tokens.bgHover : 'transparent' }]}>
            <ChevronLeft size={24} strokeWidth={2} color={tokens.fg1} />
          </Pressable>
        )}
      </View>
      <Text accessibilityRole="header" style={[styles.title, { color: tokens.fg1 }]}>{title}</Text>
      <View style={styles.action}>{action}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16 },
  leading: { flex: 1, minWidth: 44, alignItems: 'flex-start' },
  back: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  title: { flexShrink: 1, fontFamily: 'GeistMono_500Medium', fontSize: 13, letterSpacing: 1.17, textTransform: 'uppercase', textAlign: 'center' },
  action: { flex: 1, minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12 },
})
