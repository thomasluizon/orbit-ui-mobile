import { NextResponse } from 'next/server'
import { API } from '@orbit/shared/api'
import { accountEventTicketSchema } from '@orbit/shared/types/account-event'
import { serverAuthMutate } from '@/lib/server-fetch'

export async function POST(): Promise<NextResponse> {
  const ticket = await serverAuthMutate(
    API.events.ticket,
    { method: 'POST', cache: 'no-store' },
    null,
    accountEventTicketSchema,
  )
  return NextResponse.json({
    ticket: ticket.ticket,
    apiBase: process.env.NODE_ENV === 'production'
      ? 'https://api.useorbit.org'
      : process.env.API_BASE ?? 'http://localhost:5000',
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
