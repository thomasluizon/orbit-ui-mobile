import { useEffect, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { consumeAccountEventStream, invalidateAccountEvent } from '@orbit/shared/query'
import { useAuthStore } from '@/stores/auth-store'
import { openAccountEventStream } from './account-event-stream'
import { getAccountEventOrigin, setAccountEventOrigin } from './account-event-origin'

export function AccountEventConnection(): null {
  const queryClient = useQueryClient()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState)

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState)
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    if (!isAuthenticated || appState !== 'active') return
    const controller = new AbortController()
    void consumeAccountEventStream({
      signal: controller.signal,
      open: openAccountEventStream,
      onReconnect: (lastEventId) => {
        setAccountEventOrigin(null)
        if (!lastEventId) {
          invalidateAccountEvent(queryClient, { type: 'resync', payload: { v: 1, changes: [] } }, null)
        }
      },
      onEvent: (event) => {
        if (event.type === 'ready') setAccountEventOrigin(event.connectionId)
        else invalidateAccountEvent(queryClient, event, getAccountEventOrigin())
      },
    })
    return () => {
      controller.abort()
      setAccountEventOrigin(null)
    }
  }, [appState, isAuthenticated, queryClient])

  return null
}
