import type { ReactNode } from 'react'
import { View } from 'react-native'
import { finishTodayLaunch } from '@/lib/today-launch'

export function TodayLaunchContent({ enabled, fromCache, empty, children }: Readonly<{
  enabled: boolean
  fromCache: boolean
  empty: boolean
  children: ReactNode
}>) {
  if (!enabled) return children
  return <View collapsable={false} onLayout={() => finishTodayLaunch(fromCache, empty)}>{children}</View>
}
