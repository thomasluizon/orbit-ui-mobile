// @vitest-environment node
import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { API } from '@orbit/shared/api'
import { agentExecuteOperationResponseSchema } from '@orbit/shared/types/ai'
import { makeAgentOperationResult, makeClarificationPreviewMessage, makeHeldHabitMessage } from '@orbit/shared/test-support/chat-fixtures'
import { accountEventTicketSchema } from '@orbit/shared/types/account-event'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { mintHermeticJwt } from '../../test-support/hermetic/hermetic-session'
import { handleRequest } from '../../test-support/hermetic/mock-api/request-handler'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { notificationsResponseSchema } from '@orbit/shared/types/notification'
import { LAYOUT_FIXED_TIME } from '../../e2e/layout/clock.mjs'

let server: Server
let origin: string
const STREAM_IDLE_WINDOW_MS = 250
const pageFor = (id: string) => createPaginatedSchema(habitScheduleItemSchema).parse({
  ...emptyHabitsPageFixture,
  items: [makeHabitScheduleItem({ id, title: id })],
  totalCount: 1,
})
const tokenFor = (session: string) => mintHermeticJwt(undefined, undefined, undefined, session)
const seed = (session: string, body: unknown) => fetch(`${origin}/_test/session-fixtures`, {
  method: 'PUT', headers: { Authorization: `Bearer ${tokenFor(session)}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ fixtures: [{ path: '/api/habits', body }] }),
})
const read = (session: string, query = '') => fetch(`${origin}/api/habits${query}`, {
  headers: { Authorization: `Bearer ${tokenFor(session)}` },
})

beforeAll(async () => {
  server = createServer(handleRequest)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a mock API port')
  origin = `http://127.0.0.1:${address.port}`
})
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

describe('mock API account events', () => {
  it('serves a schema-valid ticket for the account event connection', async () => {
    const response = await fetch(`${origin}${API.events.ticket}`, {
      method: 'POST', headers: { Authorization: `Bearer ${tokenFor('events')}` },
    })
    expect(response.status).toBe(200)
    const ticket = accountEventTicketSchema.parse(await response.json())
    expect(ticket.ticket).not.toBe('')
    expect(Date.parse(ticket.expiresAtUtc)).toBeGreaterThan(Date.now())
  })

  it('keeps the cross-origin account event stream idle until the client aborts', async () => {
    const ticketResponse = await fetch(`${origin}${API.events.ticket}`, { method: 'POST' })
    const { ticket } = accountEventTicketSchema.parse(await ticketResponse.json())
    const streamUrl = new URL(API.events.stream, origin)
    streamUrl.searchParams.set('ticket', ticket)
    const controller = new AbortController()
    try {
      const response = await fetch(streamUrl, {
        signal: controller.signal, headers: { Origin: 'http://127.0.0.1:3000' },
      })
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/event-stream')
      expect(response.headers.get('access-control-allow-origin')).toBe('*')
      expect(response.headers.get('cache-control')).toBe('no-store')
      if (!response.body) throw new Error('Expected an account event stream')
      const pendingRead = response.body.getReader().read()
      const readStateAfterIdleWindow = await Promise.race([
        pendingRead.then(() => 'settled', () => 'settled'),
        new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), STREAM_IDLE_WINDOW_MS)),
      ])
      expect(readStateAfterIdleWindow).toBe('pending')
      controller.abort()
      await expect(pendingRead).rejects.toMatchObject({ name: 'AbortError' })
    } finally {
      controller.abort()
    }
  })
})

describe('mock API session fixtures', () => {
  it('serves delayed notifications to authenticated server reads in their seeded session', async () => {
    const notifications = notificationsResponseSchema.parse({ items: [createMockNotification()], unreadCount: 15 })
    const response = await fetch(`${origin}/_test/session-fixtures`, {
      method: 'PUT', headers: { Authorization: `Bearer ${tokenFor('notification-delay')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixtures: [{ path: API.notifications.list, body: notifications, delayMs: 100 }] }),
    })
    expect(response.status).toBe(204)
    const pendingNotifications = fetch(`${origin}${API.notifications.list}`, {
      headers: { Authorization: `Bearer ${tokenFor('notification-delay')}` },
    })
    expect(await Promise.race([
      pendingNotifications.then(() => 'arrived'),
      new Promise<string>((resolve) => setTimeout(() => resolve('pending'), 20)),
    ])).toBe('pending')
    expect(await (await pendingNotifications).json()).toEqual(notifications)
    expect(await (await fetch(`${origin}${API.notifications.list}`)).json()).toEqual({ items: [], unreadCount: 0 })
  })

  it('serves the held habit preview to server-side clarification resolutions', async () => {
    const preview = agentExecuteOperationResponseSchema.parse({
      operation: makeAgentOperationResult('PendingConfirmation', 1),
      pendingOperation: { ...makeHeldHabitMessage().pendingOperations![0]!, actionKey: 'createHabit', expiresAtUtc: '2099-01-01T00:00:00Z' },
    })
    const operationIds = [
      makeClarificationPreviewMessage().actions![0]!.clarificationRequest!.operationId,
      '00000000-0000-4000-8000-000000000002',
    ]
    for (const [index, operationId] of operationIds.entries()) {
      const response = await fetch(`${origin}${API.ai.clarificationResolve(operationId)}`, {
        method: 'POST', headers: { Authorization: `Bearer ${tokenFor(`clarification-${index}`)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'daily' }),
      })
      expect(response.status).toBe(200)
      const resolved = agentExecuteOperationResponseSchema.parse(await response.json())
      expect(resolved).toEqual(preview)
      expect(new Date(resolved.pendingOperation!.expiresAtUtc).getTime()).toBeGreaterThan(new Date(LAYOUT_FIXED_TIME).getTime())
    }
  })

  it('keeps clarification previews off unrelated routes and request methods', async () => {
    const path = API.ai.clarificationResolve(makeClarificationPreviewMessage().actions![0]!.clarificationRequest!.operationId)
    for (const [method, pathname] of [['GET', path], ['POST', `${path}/extra`], ['POST', '/api/ai/clarifications/resolve']]) {
      const response = await fetch(`${origin}${pathname}`, { method })
      expect(await response.json()).toEqual({})
    }
  })

  it('serves isolated seeded pages to server and browser reads and keeps unseeded defaults', async () => {
    const first = pageFor('first-session-habit')
    const second = pageFor('second-session-habit')
    const seeded = await seed('first', first)
    await seed('second', second)
    expect(await (await read('first', '?dateFrom=2026-09-04')).json()).toEqual(first)
    expect(await (await read('second')).json()).toEqual(second)
    expect(await (await read('first')).json()).toEqual(first)
    expect(seeded.status).toBe(204)
    expect(await (await read('unseeded')).json()).toEqual(emptyHabitsPageFixture)
  })

  it('rejects invalid bodies without replacing a valid session fixture', async () => {
    const valid = pageFor('valid-habit')
    await seed('validation', valid)
    expect((await seed('validation', { items: [{ id: 'invalid' }] })).status).toBe(400)
    expect(await (await read('validation')).json()).toEqual(valid)
  })

  it('keeps query-specific pages and mutation refetches in their own session', async () => {
    const first = pageFor('query-first')
    const second = pageFor('query-second')
    const created = pageFor('created-habit')
    const response = await fetch(`${origin}/_test/session-fixtures`, {
      method: 'PUT', headers: { Authorization: `Bearer ${tokenFor('changing')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixtures: [
        { path: '/api/habits', body: first, afterMutation: { method: 'POST', path: '/api/habits', body: created } },
        { path: '/api/habits', query: { search: 'Read', page: '2' }, body: second },
      ] }),
    })
    expect(response.status).toBe(204)
    expect(await (await read('changing', '?page=2&search=Read')).json()).toEqual(second)
    expect(await (await read('changing')).json()).toEqual(first)
    await fetch(`${origin}/api/habits`, { method: 'POST', headers: { Authorization: `Bearer ${tokenFor('other-mutation')}` } })
    expect(await (await read('changing')).json()).toEqual(first)
    await fetch(`${origin}/api/habits`, { method: 'POST', headers: { Authorization: `Bearer ${tokenFor('changing')}` } })
    expect(await (await read('changing')).json()).toEqual(created)
    expect(await (await read('changing', '?search=Read&page=2')).json()).toEqual(second)
    expect(await (await read('unseeded')).json()).toEqual(emptyHabitsPageFixture)
  })

  it('requires a session and validates profile fixtures and future mutation bodies atomically', async () => {
    const request = (token: string, fixtures: unknown) => fetch(`${origin}/_test/session-fixtures`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixtures }),
    })
    expect((await request(mintHermeticJwt(), [{ path: '/api/habits', body: pageFor('no-session') }])).status).toBe(400)
    expect((await request(tokenFor('atomic'), [
      { path: '/api/habits', body: pageFor('not-stored') }, { path: '/api/profile', body: {} },
    ])).status).toBe(400)
    expect(await (await read('atomic')).json()).toEqual(emptyHabitsPageFixture)
    expect((await request(tokenFor('atomic'), [{ path: '/unknown', body: {} }])).status).toBe(400)
    expect((await request(tokenFor('atomic'), [{
      path: '/api/habits', body: pageFor('not-stored'), afterMutation: { method: 'POST', path: '/api/habits', body: {} },
    }])).status).toBe(400)
  })
})
