'use client'

import { createContext, useState, type ReactNode } from 'react'
import type { NotificationsResponse } from '@orbit/shared/types/notification'
import { useAccountGeneration } from '@/hooks/use-session-reset'

export interface PreloadedNotifications {
  notifications: NotificationsResponse
  updatedAt: number
}

export const PreloadedNotificationsContext = createContext<PreloadedNotifications | undefined>(undefined)

export function NotificationsPreload({ initialNotifications, children }: Readonly<{
  initialNotifications: PreloadedNotifications | null
  children?: ReactNode
}>) {
  const accountGeneration = useAccountGeneration()
  const [preloadAccountGeneration] = useState(accountGeneration)
  const initialResponse = accountGeneration === preloadAccountGeneration
    ? initialNotifications ?? undefined
    : undefined

  return <PreloadedNotificationsContext.Provider value={initialResponse}>{children}</PreloadedNotificationsContext.Provider>
}
