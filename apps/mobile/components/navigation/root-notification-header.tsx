import { SPACING, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { StyleSheet, View } from 'react-native'
import type { ReactNode } from 'react'
import { NotificationBell } from './notification-bell'
import { ThemeToggle } from '@/components/ui/theme-toggle'

export function DestinationHeaderRow({ children, testID, gap = 8, wrap = false }: Readonly<{ children: ReactNode; testID: string; gap?: number; wrap?: boolean }>) {
  return <View testID={testID} style={[styles.row, { gap, flexWrap: wrap ? 'wrap' : 'nowrap' }]}>{children}</View>
}

export function HeaderAppearanceActions() {
  return <View testID="header-appearance-actions" style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.s8, minHeight: TOUCH_TARGET_MIN }}><ThemeToggle /><NotificationBell /></View>
}

export function RootNotificationHeader() {
  return <DestinationHeaderRow testID="root-notification-header"><HeaderAppearanceActions /></DestinationHeaderRow>
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', minHeight: TOUCH_TARGET_MIN + SPACING.s24, paddingHorizontal: SPACING.s16, paddingBottom: SPACING.s24 } })
