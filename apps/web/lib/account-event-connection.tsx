'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  consumeAccountEventStream, invalidateAccountEvent, invalidateAccountQueriesAtFailure, invalidateAccountQueriesBefore,
} from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { useAuthStore } from '@/stores/auth-store'
import { ApiError, fetchWithUpgradeGuidance, sessionAwareFetch } from './api-fetch'
import { getAccountEventOrigin, setAccountEventOrigin } from './account-event-origin'

interface TicketResponse { ticket: string; apiBase: string }

export function AccountEventConnection(): null {
  const queryClient = useQueryClient()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  useEffect(() => {
    if (!isAuthenticated) return
    let controller: AbortController | null = null
    let lastEventId: string | null = null
    let resumed = false
    function close() {
      controller?.abort()
      controller = null
      setAccountEventOrigin(null)
    }
    function syncVisibility() {
      close()
      if (document.visibilityState !== 'visible') return
      controller = new AbortController()
      const connectionSignal = controller.signal
      void consumeAccountEventStream({
        signal: connectionSignal,
        lastEventId,
        resumed,
        open: async (signal, lastEventId) => {
          const ticketResponse = await sessionAwareFetch(API.events.ticket, { method: 'POST', signal, cache: 'no-store' })
          if (!ticketResponse.ok) throw new ApiError(ticketResponse.status, 'Event ticket unavailable', undefined, ticketResponse.headers.get('retry-after'))
          const { ticket, apiBase } = await ticketResponse.json() as TicketResponse
          const url = new URL(API.events.stream, apiBase)
          url.searchParams.set('ticket', ticket)
          return fetchWithUpgradeGuidance(url, {
            signal,
            cache: 'no-store',
            headers: lastEventId ? { 'Last-Event-ID': lastEventId } : undefined,
          })
        },
        onOpen: (openedAt, hasReplayCursor) => invalidateAccountQueriesBefore(queryClient, openedAt, hasReplayCursor),
        onFirstFailure: (failedAt) => invalidateAccountQueriesAtFailure(queryClient, failedAt, connectionSignal),
        onReconnect: () => setAccountEventOrigin(null),
        onEvent: (event) => {
          if (event.id) lastEventId = event.id
          if (event.type === 'ready') setAccountEventOrigin(event.connectionId)
          else invalidateAccountEvent(queryClient, event, getAccountEventOrigin())
        },
      })
      resumed = true
    }
    document.addEventListener('visibilitychange', syncVisibility)
    syncVisibility()
    return () => {
      document.removeEventListener('visibilitychange', syncVisibility)
      close()
    }
  }, [isAuthenticated, queryClient])
  return null
}
