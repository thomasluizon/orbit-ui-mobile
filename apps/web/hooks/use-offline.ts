'use client'

import { useState, useEffect, useCallback } from 'react'
import { replayQueue, getQueueSize } from '@/lib/offline-queue'

export function useOffline() {
  const [isOnline, setIsOnline] = useState(true)
  const [queueSize, setQueueSize] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    // Set initial state
    setIsOnline(navigator.onLine)

    const handleOnline = () => {
      setIsOnline(true)
      // Auto-sync when coming back online
      sync()
    }
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Check queue size on mount
    getQueueSize().then(setQueueSize)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const sync = useCallback(async () => {
    if (isSyncing || !navigator.onLine) return
    setIsSyncing(true)
    try {
      const result = await replayQueue()
      const remaining = await getQueueSize()
      setQueueSize(remaining)
      return result
    } finally {
      setIsSyncing(false)
    }
  }, [isSyncing])

  const refreshQueueSize = useCallback(async () => {
    const size = await getQueueSize()
    setQueueSize(size)
  }, [])

  return {
    isOnline,
    queueSize,
    isSyncing,
    sync,
    refreshQueueSize,
  }
}
