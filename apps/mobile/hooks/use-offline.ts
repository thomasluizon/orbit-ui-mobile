import { useState, useEffect, useCallback, useRef } from 'react'
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'
import { AppState, type AppStateStatus } from 'react-native'
import * as offlineQueue from '@/lib/offline-queue'
import { canAutoFlush, flushQueuedMutations } from '@/lib/offline-mutations'
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

  // react-doctor-disable-next-line effect-needs-cleanup -- FP: the effect cleans up — `return () => unsubscribe()` invokes NetInfo's unsubscribe; RD only recognizes removeEventListener/subscription.remove(), not an unsubscribe callback. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
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

  useEffect(() => {
    const unsubscribe = offlineQueue.subscribeQueueCount(setPendingCount)
    return () => unsubscribe()
  }, [])

  const flush = useCallback(async () => {
    if (flushLock.current || !canAutoFlush()) return
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

  useEffect(() => {
    if (isOnline && pendingCount > 0 && !isFlushing) {
      void flush()
    }
  }, [isOnline, pendingCount, isFlushing, flush])

  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active' && isOnline && pendingCount > 0) {
        void flush()
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
