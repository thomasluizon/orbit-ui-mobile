import { StyleSheet, View } from 'react-native'
import { NotificationBell } from './notification-bell'

export function RootNotificationHeader({ inset = 16 }: Readonly<{ inset?: number }>) {
  return <View testID="root-notification-header" style={[styles.row, { paddingHorizontal: inset }]}><NotificationBell /></View>
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', minHeight: 48 } })
