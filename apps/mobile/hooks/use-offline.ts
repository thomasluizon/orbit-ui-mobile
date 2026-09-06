import { useState, useEffect, useCallback } from 'react'
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'
import { AppState, type AppStateStatus } from 'react-native'
import * as offlineQueue from '@/lib/offline-queue'
import { canAutoFlush, flushQueuedMutations } from '@/lib/offline-mutations'
import { useOfflineSyncStore } from '@/stores/offline-sync-store'
import { captureError } from '@/lib/sentry'
import { getCurrentConnectivity, setCachedConnectivity } from '@/lib/offline-runtime'
import type { QueuedMutation } from '@orbit/shared/types/sync'

interface UseOfflineReturn {
  isOnline: boolean
  pendingCount: number
  hasFailed: boolean
  enqueue: (mutation: Omit<QueuedMutation, 'retries' | 'maxRetries'>) => void
  flush: () => Promise<void>
  isFlushing: boolean
}

export function useOffline(manageQueue = false): UseOfflineReturn {
  const [isOnline, setIsOnline] = useState(true)
  const [connectivityReady, setConnectivityReady] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [hasFailed, setHasFailed] = useState(false)
  const isFlushing = useOfflineSyncStore((state) => state.isFlushing)
  const isRetrying = useOfflineSyncStore((state) => state.isRetrying)

  // react-doctor-disable-next-line effect-needs-cleanup -- FP: the effect cleans up — `return () => unsubscribe()` invokes NetInfo's unsubscribe; RD only recognizes removeEventListener/subscription.remove(), not an unsubscribe callback. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  useEffect(() => {
    void getCurrentConnectivity().then((online) => {
      setCachedConnectivity(online)
      setIsOnline(online)
      setConnectivityReady(true)
    })

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = state.isConnected === true && state.isInternetReachable !== false
      setCachedConnectivity(online)
      setIsOnline(online)
      setConnectivityReady(true)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const unsubscribe = offlineQueue.subscribeQueueCount((count) => {
      setPendingCount(count)
      setHasFailed(offlineQueue.getAll().some((mutation) => mutation.status === 'failed'))
    })
    return () => unsubscribe()
  }, [])

  const flush = useCallback(async () => {
    if (!canAutoFlush()) return
    try {
      await flushQueuedMutations()
    } catch (error) {
      captureError(error)
    } finally {
      setPendingCount(offlineQueue.count())
    }
  }, [])

  useEffect(() => {
    if (manageQueue && connectivityReady && isOnline && pendingCount > 0 && !isFlushing) {
      void flush()
    }
  }, [manageQueue, connectivityReady, isOnline, pendingCount, isFlushing, flush])

  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (manageQueue && connectivityReady && nextState === 'active' && isOnline && pendingCount > 0) {
        void flush()
      }
    }
    const subscription = AppState.addEventListener('change', handleAppState)
    return () => subscription.remove()
  }, [manageQueue, connectivityReady, isOnline, pendingCount, flush])

  const enqueue = useCallback(
    (mutation: Omit<QueuedMutation, 'retries' | 'maxRetries'>) => {
      offlineQueue.enqueue(mutation)
    },
    [],
  )

  return { isOnline, pendingCount, hasFailed: hasFailed || isRetrying, enqueue, flush, isFlushing }
}
