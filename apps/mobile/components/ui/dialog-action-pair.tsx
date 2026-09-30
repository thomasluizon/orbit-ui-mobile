import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

/** Intrinsic-width dialog actions aligned to the trailing edge. */
export function DialogActionPair({ children }: Readonly<{ children: ReactNode; inline?: boolean }>) {
  return <View testID="dialog-action-pair" style={styles.pair}>{children}</View>
}

const styles = StyleSheet.create({
  pair: { gap: 12, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' },
})
