import { useState, useEffect, useCallback } from 'react'
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'
import { AppState, type AppStateStatus } from 'react-native'
import * as offlineQueue from '@/lib/offline-queue'
import {
  canAutoFlush,
  flushQueuedMutations,
  getReplayState,
  resumeOfflineReplay,
  subscribeReplayState,
  type OfflineReplayState,
} from '@/lib/offline-mutations'
import { getCurrentConnectivity, setCachedConnectivity } from '@/lib/offline-runtime'
import { captureError } from '@/lib/sentry'
import type { QueuedMutation } from '@orbit/shared/types/sync'

interface UseOfflineReturn {
  isOnline: boolean
  pendingCount: number
  hasFailed: boolean
  enqueue: (mutation: Omit<QueuedMutation, 'retries' | 'maxRetries'>) => void
  flush: () => Promise<void>
  isFlushing: boolean
  replayState: OfflineReplayState
}

export function useOffline(manageQueue = false): UseOfflineReturn {
  const [isOnline, setIsOnline] = useState(true)
  const [connectivityReady, setConnectivityReady] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [hasFailed, setHasFailed] = useState(false)
  const [replayState, setReplayState] = useState(getReplayState)
  const isFlushing = replayState === 'flushing'

  // react-doctor-disable-next-line effect-needs-cleanup -- FP: the effect cleans up — `return () => unsubscribe()` invokes NetInfo's unsubscribe; RD only recognizes removeEventListener/subscription.remove(), not an unsubscribe callback. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  useEffect(() => {
    void getCurrentConnectivity().then((online) => {
      setCachedConnectivity(online)
      setIsOnline(online)
      setConnectivityReady(true)
    })

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = state.isConnected === true && state.isInternetReachable !== false
      if (manageQueue && online && getReplayState() === 'stopped-for-auth') {
        resumeOfflineReplay()
      }
      setCachedConnectivity(online)
      setIsOnline(online)
      setConnectivityReady(true)
    })
    return () => unsubscribe()
  }, [manageQueue])

  useEffect(() => {
    const unsubscribe = offlineQueue.subscribeQueueCount((nextCount) => {
      setPendingCount(nextCount)
      setHasFailed(offlineQueue.getAll().some((mutation) => mutation.status === 'failed'))
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => subscribeReplayState(setReplayState), [])

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
    if (
      manageQueue &&
      connectivityReady &&
      isOnline &&
      pendingCount > 0 &&
      replayState === 'idle'
    ) {
      void flush()
    }
  }, [manageQueue, connectivityReady, isOnline, pendingCount, replayState, flush])

  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (
        manageQueue &&
        connectivityReady &&
        nextState === 'active' &&
        isOnline &&
        pendingCount > 0
      ) {
        if (getReplayState() === 'stopped-for-auth') resumeOfflineReplay()
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

  return {
    isOnline,
    pendingCount,
    hasFailed: hasFailed || replayState === 'waiting-on-backoff',
    enqueue,
    flush,
    isFlushing,
    replayState,
  }
}
