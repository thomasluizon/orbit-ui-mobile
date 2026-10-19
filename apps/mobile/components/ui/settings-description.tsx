import { SPACING } from '@orbit/shared/theme'
import { useMemo, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface SettingsDescriptionProps {
  children: ReactNode
  inset?: boolean
}

/** Helper text under a settings row: Geist Sans 14 fg-3, row-aligned 16px horizontal padding. */
export function SettingsDescription({ children, inset = true }: Readonly<SettingsDescriptionProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  return (
    <View style={[styles.container, !inset && styles.flush]}>
      <Text style={[styles.text, { color: tokens.fg3 }]}>{children}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingTop: SPACING.s4,
    paddingHorizontal: SPACING.s16,
    paddingBottom: SPACING.s16,
  },
  flush: { paddingHorizontal: SPACING.s0 },
  text: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
})
