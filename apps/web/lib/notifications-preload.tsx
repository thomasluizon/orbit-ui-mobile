'use client'

import { createContext, useState, type ReactNode } from 'react'
import type { NotificationsResponse } from '@orbit/shared/types/notification'
import { useAccountGeneration } from '@/hooks/use-session-reset'

export const PreloadedNotificationsContext = createContext<NotificationsResponse | undefined>(undefined)

export function NotificationsPreload({ initialNotifications, children }: Readonly<{
  initialNotifications: NotificationsResponse | null
  children?: ReactNode
}>) {
  const accountGeneration = useAccountGeneration()
  const [preloadAccountGeneration] = useState(accountGeneration)
  const initialResponse = accountGeneration === preloadAccountGeneration
    ? initialNotifications ?? undefined
    : undefined

  return <PreloadedNotificationsContext.Provider value={initialResponse}>{children}</PreloadedNotificationsContext.Provider>
}
