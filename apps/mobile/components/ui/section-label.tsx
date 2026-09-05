import type { SectionTitleProps } from '@orbit/shared/contracts/navigation'
import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function SectionLabel({ children, eyebrow }: Readonly<SectionTitleProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return (
    <View testID={eyebrow !== undefined ? 'section-title-eyebrow' : 'section-title'} style={styles.container}>
      {eyebrow !== undefined && <Text testID="section-eyebrow" style={[styles.eyebrow, { color: tokens.fg3 }]}>{eyebrow}</Text>}
      <Text accessibilityRole="header" style={[styles.title, { color: tokens.fg1 }]}>{children}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { paddingTop: 24, paddingBottom: 12, paddingHorizontal: 16, gap: 8 },
  eyebrow: { fontFamily: 'GeistMono_500Medium', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.96 },
  title: { fontFamily: 'Geist_500Medium', fontSize: 20, letterSpacing: -0.2 },
})
