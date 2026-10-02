import type { ReactNode } from 'react'
import { StyleSheet, Text } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function FormSectionLabel({ children }: Readonly<{ children: ReactNode }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <Text accessibilityRole="header" style={[styles.label, { color: tokens.fg2 }]}>{children}</Text>
}

const styles = StyleSheet.create({
  label: { fontFamily: 'Geist_500Medium', fontSize: 14, marginBottom: 8 },
})
