import { NextResponse } from 'next/server'
import { API } from '@orbit/shared/api'
import { accountEventTicketSchema } from '@orbit/shared/types/account-event'
import { serverAuthMutate } from '@/lib/server-fetch'
import { accountEventApiBase } from '@/lib/account-event-api-base'

export async function POST(): Promise<NextResponse> {
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
}
