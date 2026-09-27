import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import TestRenderer, { act } from 'react-test-renderer'
import { AccountEventConnection } from '@/lib/account-event-connection'
import { getAccountEventOrigin, setAccountEventOrigin } from '@/lib/account-event-origin'

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  expoFetch: vi.fn(),
  getToken: vi.fn(() => Promise.resolve('token')),
  refreshSessionToken: vi.fn(),
  onAppState: null as null | ((state: string) => void),
}))

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }))
vi.mock('react-native', () => ({ AppState: {
  currentState: 'active',
  addEventListener: (_type: string, listener: (state: string) => void) => {
    mocks.onAppState = listener
    return { remove: () => { mocks.onAppState = null } }
  },
} }))
vi.mock('expo/fetch', () => ({ fetch: mocks.expoFetch }))
vi.mock('@/lib/secure-store', () => ({ getToken: mocks.getToken }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (select: (state: { isAuthenticated: boolean }) => boolean) => select({ isAuthenticated: true }),
  refreshSessionToken: mocks.refreshSessionToken,
}))

afterEach(() => {
  mocks.expoFetch.mockReset()
  mocks.invalidateQueries.mockReset()
  setAccountEventOrigin(null)
})

it('uses the bearer stream while active and closes it in background', async () => {
  const id = '123e4567-e89b-42d3-a456-426614174000'
  const ownChange = `event: changes\ndata: ${JSON.stringify({
    v: 1, origin: 'mobile', changes: [{ kind: 'habitLog', op: 'create', ids: [id] }],
  })}\n\n`
  const stream = `event: ready\ndata: {"connectionId":"mobile"}\n\n${ownChange}event: changes\ndata: ${JSON.stringify({
    v: 1, origin: 'other', changes: [{ kind: 'habitLog', op: 'create', ids: [id] }],
  })}\n\n`
  mocks.expoFetch.mockImplementation((_url: string, init: RequestInit) => Promise.resolve({
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(stream))
        init.signal?.addEventListener('abort', () => controller.close(), { once: true })
      },
    }),
  }))
  await act(async () => {
    TestRenderer.create(React.createElement(AccountEventConnection))
    await Promise.resolve()
  })
  expect(mocks.expoFetch).toHaveBeenCalledWith(
    'https://api.useorbit.org/api/events',
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token' }) }),
  )
  expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['habits'] })
  expect(mocks.invalidateQueries).toHaveBeenCalledTimes(3)
  expect(getAccountEventOrigin()).toBe('mobile')
  await act(async () => {
    mocks.onAppState?.('background')
    await Promise.resolve()
  })
  expect(getAccountEventOrigin()).toBeNull()
})

it('replays changes missed while the app was backgrounded', async () => {
  mocks.expoFetch.mockImplementation((_url: string, _init: RequestInit) => Promise.resolve({
    ok: true, status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('id: epoch.5\nevent: changes\ndata: {"v":1,"changes":[]}\n\n')) },
    }),
  }))
  await act(async () => { TestRenderer.create(React.createElement(AccountEventConnection)); await Promise.resolve() })
  await act(async () => { mocks.onAppState?.('background'); await Promise.resolve() })
  await act(async () => { mocks.onAppState?.('active'); await Promise.resolve() })
  expect(mocks.expoFetch).toHaveBeenCalledTimes(2)
  expect(mocks.expoFetch.mock.calls[1]?.[1]).toMatchObject({ headers: expect.objectContaining({ 'Last-Event-ID': 'epoch.5' }) })
})

it('refreshes Today when returning without a replay cursor', async () => {
  mocks.expoFetch.mockImplementation(() => Promise.resolve({
    ok: true, status: 200,
    body: new ReadableStream<Uint8Array>({ start() {} }),
  }))
  await act(async () => { TestRenderer.create(React.createElement(AccountEventConnection)); await Promise.resolve() })
  await act(async () => { mocks.onAppState?.('background'); await Promise.resolve() })
  await act(async () => { mocks.onAppState?.('active'); await Promise.resolve() })
  expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['habits'] })
})
