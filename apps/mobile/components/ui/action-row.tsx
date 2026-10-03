import { createContext, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { TOUCH_TARGET_MIN, SMALL_PILL_VISIBLE_MIN } from '@orbit/shared/theme'

const hitPadding = (TOUCH_TARGET_MIN - SMALL_PILL_VISIBLE_MIN) / 2

export const ActionRowContext = createContext(false)

export function ActionRow({ children }: Readonly<{ children: ReactNode }>) {
  return <ActionRowContext value>
    <View testID="action-row" hitSlop={{ left: hitPadding, right: hitPadding }} style={styles.row}>{children}</View>
  </ActionRowContext>
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 12, paddingVertical: hitPadding, marginVertical: -hitPadding, minWidth: 0, maxWidth: '100%', width: '100%' },
})
