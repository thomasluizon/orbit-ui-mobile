import { useEffect, useRef, useState } from 'react'
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
  const lastEventId = useRef<string | null>(null)
  const hasOpened = useRef(false)

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState)
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      lastEventId.current = null
      hasOpened.current = false
      return
    }
    if (appState !== 'active') return
    if (hasOpened.current && !lastEventId.current) {
      invalidateAccountEvent(queryClient, { type: 'resync', payload: { v: 1, changes: [] } }, null)
    }
    hasOpened.current = true
    const controller = new AbortController()
    void consumeAccountEventStream({
      signal: controller.signal,
      lastEventId: lastEventId.current,
      open: openAccountEventStream,
      onReconnect: (lastEventId) => {
        setAccountEventOrigin(null)
        if (!lastEventId) {
          invalidateAccountEvent(queryClient, { type: 'resync', payload: { v: 1, changes: [] } }, null)
        }
      },
      onEvent: (event) => {
        if (event.id) lastEventId.current = event.id
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
