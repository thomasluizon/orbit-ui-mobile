import { useMemo, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface SettingsDescriptionProps {
  children: ReactNode
}

/** Helper text under a settings row: Rubik 14 fg-3, row-aligned 20px horizontal padding. */
export function SettingsDescription({ children }: Readonly<SettingsDescriptionProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  return (
    <View style={styles.container}>
      <Text style={[styles.text, { color: tokens.fg3 }]}>{children}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 4,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  text: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
})
