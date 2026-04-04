import { useState, useEffect, useCallback, useRef } from 'react'
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'
import { AppState, type AppStateStatus } from 'react-native'
import { apiClient } from '@/lib/api-client'
import * as offlineQueue from '@/lib/offline-queue'
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
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = state.isConnected === true && state.isInternetReachable !== false
      setIsOnline(online)
    })
    return () => unsubscribe()
  }, [])

  // Update pending count on mount
  useEffect(() => {
    setPendingCount(offlineQueue.count())
  }, [])

  // Flush queue when coming back online
  const flush = useCallback(async () => {
    if (flushLock.current) return
    flushLock.current = true
    setIsFlushing(true)

    try {
      const mutations = offlineQueue.getAll()
      for (const mutation of mutations) {
        try {
          await apiClient(mutation.endpoint, {
            method: mutation.method,
            body: mutation.payload ? JSON.stringify(mutation.payload) : undefined,
          })
          offlineQueue.remove(mutation.id)
        } catch (err) {
          offlineQueue.incrementRetries(mutation.id)
          // If max retries exceeded, remove the mutation
          if (mutation.retries + 1 >= mutation.maxRetries) {
            offlineQueue.remove(mutation.id)
          }
        }
      }
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
      setPendingCount(offlineQueue.count())
    },
    [],
  )

  return { isOnline, pendingCount, enqueue, flush, isFlushing }
}
