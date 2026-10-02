import { NextResponse } from 'next/server'
import { API } from '@orbit/shared/api'
import { ApiClientError } from '@orbit/shared'
import { buildSessionRefreshHeaders } from '@/lib/session-refresh'
import { accountEventTicketSchema } from '@orbit/shared/types/account-event'
import { serverAuthMutate } from '@/lib/server-fetch'
import { accountEventApiBase } from '@/lib/account-event-api-base'

export async function POST(): Promise<NextResponse> {
  try {
    const ticket = await serverAuthMutate(
      API.events.ticket,
      { method: 'POST', cache: 'no-store' },
      null,
      accountEventTicketSchema,
    )
    return NextResponse.json({
      ticket: ticket.ticket,
      apiBase: accountEventApiBase(),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error: unknown) {
    if (!(error instanceof ApiClientError) || error.status !== 401) throw error
    const refreshFailed = 'sessionRefreshFailed' in error && error.sessionRefreshFailed === true
    return NextResponse.json({ error: 'Unauthorized' }, {
      status: 401,
      headers: { ...buildSessionRefreshHeaders(refreshFailed), 'Cache-Control': 'private, no-store' },
    })
  }
}
