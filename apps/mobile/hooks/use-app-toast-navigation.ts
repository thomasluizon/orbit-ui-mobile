'use client'

import { useEffect, useRef } from 'react'
import { notifyToastNavigation } from '@orbit/shared/hooks'
import { dismissNotificationDeleteNotices } from '@/lib/pending-notification-deletes'
import { useAppToastStore } from '@/stores/app-toast-store'
import { useOfflineSyncStore } from '@/stores/offline-sync-store'

export function useAppToastNavigation(pathname: string | null) {
  const previousPathname = useRef(pathname)
  useEffect(() => {
    if (previousPathname.current === pathname) return
    previousPathname.current = pathname
    useAppToastStore.getState().dismissAllToasts()
    dismissNotificationDeleteNotices()
    useOfflineSyncStore.getState().hideAllDropNotices()
    notifyToastNavigation()
  }, [pathname])
}
