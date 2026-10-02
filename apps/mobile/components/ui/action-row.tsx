import { createContext, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

export const ActionRowContext = createContext(false)

export function ActionRow({ children }: Readonly<{ children: ReactNode }>) {
  return <ActionRowContext value>
    <View testID="action-row" style={styles.row}>{children}</View>
  </ActionRowContext>
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 12, minWidth: 0, width: '100%' },
})
