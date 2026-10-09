import React, { type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface SettingsGroupProps {
  children: ReactNode
}

/**
 * Grouped settings list: rows sit flat on the canvas (no card surface),
 * separated by full-width hairline dividers drawn by the group.
 */
export function SettingsGroup({ children }: Readonly<SettingsGroupProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const items = React.Children.toArray(children).filter(React.isValidElement)

  return (
    <View>
      {items.map((child, index) => (
        <View key={child.key} collapsable={false}>
          {index > 0 ? (
            <View style={[styles.divider, { backgroundColor: tokens.hairline }]} />
          ) : null}
          {child}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({ divider: { height: StyleSheet.hairlineWidth } })
