import { Children, isValidElement } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import type { RowListProps } from '@orbit/shared/contracts/lists'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** One shared settings panel. Habit rows deliberately do not use this container. */
export function RowList({ children, style }: Readonly<RowListProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const rows = Children.toArray(children).filter(isValidElement)

  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
        style as StyleProp<ViewStyle>,
      ]}
    >
      {rows.map((row, index) => (
        <View
          key={row.key ?? index}
          style={index === 0 ? undefined : { borderTopColor: tokens.hairline, borderTopWidth: StyleSheet.hairlineWidth }}
        >
          {row}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
})
