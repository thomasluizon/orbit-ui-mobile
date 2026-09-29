import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { MATCHED_PILL_MAX_WIDTH } from '@orbit/shared/theme'

/** Shared layout for the two matched PillButtons in a dialog. */
export function DialogActionPair({ children, inline = false }: Readonly<{ children: ReactNode; inline?: boolean }>) {
  return <View testID="dialog-action-pair" style={[styles.pair, inline && styles.inline]}>{children}</View>
}

const styles = StyleSheet.create({
  pair: { alignSelf: 'center', gap: 12, maxWidth: MATCHED_PILL_MAX_WIDTH, width: '100%' },
  inline: { flexDirection: 'row', justifyContent: 'flex-end' },
})
