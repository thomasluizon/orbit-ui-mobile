'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { consumeAccountEventStream, invalidateAccountEvent, invalidateAccountQueriesBefore } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { getAccountEventOrigin, setAccountEventOrigin } from './account-event-origin'

interface TicketResponse { ticket: string; apiBase: string }

let firstOpenCutoff = Date.now()

export function AccountEventConnection(): null {
  const queryClient = useQueryClient()

  useEffect(() => {
    let controller: AbortController | null = null
    let lastEventId: string | null = null
    let hasOpened = false
    function close() {
      if (controller) firstOpenCutoff = Date.now()
      controller?.abort()
      controller = null
      setAccountEventOrigin(null)
    }
    function syncVisibility() {
      close()
      if (document.visibilityState !== 'visible') return
      if (!hasOpened && !lastEventId) {
        invalidateAccountQueriesBefore(queryClient, firstOpenCutoff)
      }
      if (hasOpened && !lastEventId) {
        invalidateAccountEvent(queryClient, { type: 'resync', payload: { v: 1, changes: [] } }, null)
      }
      hasOpened = true
      controller = new AbortController()
      void consumeAccountEventStream({
        signal: controller.signal,
        lastEventId,
        open: async (signal, lastEventId) => {
          const ticketResponse = await fetch(API.events.ticket, { method: 'POST', signal, cache: 'no-store' })
          if (!ticketResponse.ok) throw new Error('Event ticket unavailable')
          const { ticket, apiBase } = await ticketResponse.json() as TicketResponse
          const url = new URL(API.events.stream, apiBase)
          url.searchParams.set('ticket', ticket)
          return fetch(url, {
            signal,
            cache: 'no-store',
            headers: lastEventId ? { 'Last-Event-ID': lastEventId } : undefined,
          })
        },
        onReconnect: (lastEventId) => {
          setAccountEventOrigin(null)
          if (!lastEventId) {
            invalidateAccountEvent(queryClient, { type: 'resync', payload: { v: 1, changes: [] } }, null)
          }
        },
        onEvent: (event) => {
          if (event.id) lastEventId = event.id
          if (event.type === 'ready') setAccountEventOrigin(event.connectionId)
          else invalidateAccountEvent(queryClient, event, getAccountEventOrigin())
        },
      })
    }
    document.addEventListener('visibilitychange', syncVisibility)
    syncVisibility()
    return () => {
      document.removeEventListener('visibilitychange', syncVisibility)
      close()
    }
  }, [queryClient])
  return null
}
