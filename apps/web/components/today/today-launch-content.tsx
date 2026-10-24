'use client'

import { useEffect, type ReactNode } from 'react'
import { finishTodayLaunch } from '@/lib/today-launch'

export function TodayLaunchContent({ enabled, fromCache, empty, children }: Readonly<{
  enabled: boolean
  fromCache: boolean
  empty: boolean
  children: ReactNode
}>) {
  useEffect(() => {
    if (!enabled) return
    const frame = requestAnimationFrame(() => finishTodayLaunch(fromCache, empty))
    return () => cancelAnimationFrame(frame)
  }, [enabled, fromCache, empty])
  return children
}
