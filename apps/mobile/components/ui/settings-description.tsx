import { useMemo, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface SettingsDescriptionProps {
  children: ReactNode
}

/** v8 settings description: italic helper text under a SettingsRow, separated by whitespace. */
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
    fontFamily: 'Geist',
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 20,
  },
})
