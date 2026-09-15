import { useState, useEffect, useCallback } from 'react'
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'
import { AppState, type AppStateStatus } from 'react-native'
import * as offlineQueue from '@/lib/offline-queue'
import {
  canAutoFlush,
  flushQueuedMutations,
  getReplayState,
  subscribeReplayState,
  type OfflineReplayState,
} from '@/lib/offline-mutations'
import { getCurrentConnectivity, setCachedConnectivity } from '@/lib/offline-runtime'
import { captureError } from '@/lib/sentry'
import type { QueuedMutation } from '@orbit/shared/types/sync'

interface UseOfflineReturn {
  isOnline: boolean
  pendingCount: number
  enqueue: (mutation: Omit<QueuedMutation, 'retries' | 'maxRetries'>) => void
  flush: () => Promise<void>
  isFlushing: boolean
  replayState: OfflineReplayState
}

export function useOffline(): UseOfflineReturn {
  const [isOnline, setIsOnline] = useState(true)
  const [connectivityHydrated, setConnectivityHydrated] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [replayState, setReplayState] = useState(getReplayState)
  const isFlushing = replayState === 'flushing'

  // react-doctor-disable-next-line effect-needs-cleanup -- FP: the effect cleans up — `return () => unsubscribe()` invokes NetInfo's unsubscribe; RD only recognizes removeEventListener/subscription.remove(), not an unsubscribe callback. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  useEffect(() => {
    void getCurrentConnectivity().then((online) => {
      setCachedConnectivity(online)
      setIsOnline(online)
      setConnectivityHydrated(true)
    })

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = state.isConnected === true && state.isInternetReachable !== false
      setCachedConnectivity(online)
      setIsOnline(online)
      setConnectivityHydrated(true)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const unsubscribe = offlineQueue.subscribeQueueCount(setPendingCount)
    return () => unsubscribe()
  }, [])

  useEffect(() => subscribeReplayState(setReplayState), [])

  const flush = useCallback(async () => {
    if (!canAutoFlush()) return

    try {
      await flushQueuedMutations()
    } finally {
      setPendingCount(offlineQueue.count())
    }
  }, [])

  useEffect(() => {
    if (connectivityHydrated && isOnline && pendingCount > 0 && replayState === 'idle') {
      void flush().catch(captureError)
    }
  }, [connectivityHydrated, isOnline, pendingCount, replayState, flush])

  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active' && connectivityHydrated && isOnline && pendingCount > 0) {
        void flush().catch(captureError)
      }
    }
    const subscription = AppState.addEventListener('change', handleAppState)
    return () => subscription.remove()
  }, [connectivityHydrated, isOnline, pendingCount, flush])

  const enqueue = useCallback(
    (mutation: Omit<QueuedMutation, 'retries' | 'maxRetries'>) => {
      offlineQueue.enqueue(mutation)
    },
    [],
  )

  return { isOnline, pendingCount, enqueue, flush, isFlushing, replayState }
}
