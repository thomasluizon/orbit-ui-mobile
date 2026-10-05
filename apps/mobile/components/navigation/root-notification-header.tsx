import { StyleSheet, View } from 'react-native'
import type { ReactNode } from 'react'
import { NotificationBell } from './notification-bell'

export function DestinationHeaderRow({ children, testID, gap = 8, wrap = false }: Readonly<{ children: ReactNode; testID: string; gap?: number; wrap?: boolean }>) {
  return <View testID={testID} style={[styles.row, { gap, flexWrap: wrap ? 'wrap' : 'nowrap' }]}>{children}</View>
}

export function RootNotificationHeader() {
  return <DestinationHeaderRow testID="root-notification-header"><NotificationBell /></DestinationHeaderRow>
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', minHeight: 48, paddingHorizontal: 16 } })
