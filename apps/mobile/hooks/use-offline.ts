import { useState, useEffect, useCallback, useRef } from 'react'
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'
import { AppState, type AppStateStatus } from 'react-native'
import * as offlineQueue from '@/lib/offline-queue'
import { flushQueuedMutations } from '@/lib/offline-mutations'
import { getCurrentConnectivity, setCachedConnectivity } from '@/lib/offline-runtime'
import type { QueuedMutation } from '@orbit/shared/types/sync'

interface UseOfflineReturn {
  isOnline: boolean
  pendingCount: number
  enqueue: (mutation: Omit<QueuedMutation, 'retries' | 'maxRetries'>) => void
  flush: () => Promise<void>
  isFlushing: boolean
}

export function useOffline(): UseOfflineReturn {
  const [isOnline, setIsOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [isFlushing, setIsFlushing] = useState(false)
  const flushLock = useRef(false)

  // Subscribe to network state changes
  useEffect(() => {
    void getCurrentConnectivity().then((online) => {
      setCachedConnectivity(online)
      setIsOnline(online)
    })

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = state.isConnected === true && state.isInternetReachable !== false
      setCachedConnectivity(online)
      setIsOnline(online)
    })
    return () => unsubscribe()
  }, [])

  // Update pending count on mount
  useEffect(() => {
    const unsubscribe = offlineQueue.subscribeQueueCount(setPendingCount)
    return () => unsubscribe()
  }, [])

  // Flush queue when coming back online
  const flush = useCallback(async () => {
    if (flushLock.current) return
    flushLock.current = true
    setIsFlushing(true)

    try {
      await flushQueuedMutations()
    } finally {
      setPendingCount(offlineQueue.count())
      setIsFlushing(false)
      flushLock.current = false
    }
  }, [])

  // Auto-flush when connectivity is restored
  useEffect(() => {
    if (isOnline && pendingCount > 0 && !isFlushing) {
      flush()
    }
  }, [isOnline, pendingCount, isFlushing, flush])

  // Also try flushing when app returns to foreground
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active' && isOnline && pendingCount > 0) {
        flush()
      }
    }
    const subscription = AppState.addEventListener('change', handleAppState)
    return () => subscription.remove()
  }, [isOnline, pendingCount, flush])

  const enqueue = useCallback(
    (mutation: Omit<QueuedMutation, 'retries' | 'maxRetries'>) => {
      offlineQueue.enqueue(mutation)
    },
    [],
  )

  return { isOnline, pendingCount, enqueue, flush, isFlushing }
}
