import type { SectionTitleProps } from '@orbit/shared/contracts/navigation'
import { StyleSheet, Text } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function SectionTitle({ children }: Readonly<SectionTitleProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return <Text style={[styles.title, { color: tokens.fg3 }]}>{children}</Text>
}

const styles = StyleSheet.create({
  title: {
    fontFamily: 'Geist_500Medium',
    fontSize: 12,
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 24,
    textTransform: 'uppercase',
  },
})
