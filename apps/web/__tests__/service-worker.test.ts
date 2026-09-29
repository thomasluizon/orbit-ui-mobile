import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileFunction } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

type Listener = (event: unknown) => void

interface FakeWindowClient {
  focus: ReturnType<typeof vi.fn>
  postMessage: ReturnType<typeof vi.fn>
}

function createWindowClient(): FakeWindowClient {
  const client: FakeWindowClient = {
    focus: vi.fn(),
    postMessage: vi.fn(),
  }
  client.focus.mockResolvedValue(client)
  return client
}

/** Evaluates the shipped `public/sw.js` against a fake worker global scope. */
function loadServiceWorker(windows: FakeWindowClient[] = []) {
  const source = readFileSync(resolve(__dirname, '../public/sw.js'), 'utf8')
  const listeners = new Map<string, Listener>()
  const scope = {
    addEventListener: vi.fn((type: string, listener: Listener) => {
      listeners.set(type, listener)
    }),
    registration: { showNotification: vi.fn().mockResolvedValue(undefined) },
    clients: {
      matchAll: vi.fn().mockResolvedValue(windows),
      openWindow: vi.fn().mockResolvedValue(null),
    },
  }
  compileFunction(source, ['self'])(scope)

  async function dispatch(type: string, event: Record<string, unknown>) {
    const waitUntil = vi.fn()
    listeners.get(type)?.({ ...event, waitUntil })
    expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise))
    await waitUntil.mock.calls[0]![0]
  }

  return {
    scope,
    push: (text: string | null) =>
      dispatch('push', {
        data: text === null ? null : { json: () => JSON.parse(text), text: () => text },
      }),
    click: (notificationData: Record<string, unknown>) => {
      const notification = { data: notificationData, close: vi.fn() }
      return dispatch('notificationclick', { notification }).then(() => notification)
    },
  }
}

describe('push service worker', () => {
  it('shows the API payload as a system notification', async () => {
    const worker = loadServiceWorker()

    await worker.push('{"title":"Drink water","body":"Log it now","url":"/"}')

    expect(worker.scope.registration.showNotification).toHaveBeenCalledWith('Drink water', {
      body: 'Log it now',
      icon: '/pwa-192x192.png',
      data: { url: '/' },
    })
  })

  it('keeps a payload without a url clickable', async () => {
    const worker = loadServiceWorker()

    await worker.push('{"title":"Challenge accepted","body":"Go"}')

    expect(worker.scope.registration.showNotification).toHaveBeenCalledWith('Challenge accepted', {
      body: 'Go',
      icon: '/pwa-192x192.png',
      data: {},
    })
  })

  it.each([
    ['not JSON', 'not json'],
    ['missing a title', '{"body":"Log it now","url":"/"}'],
    ['a non-string title', '{"title":42,"body":"Log it now"}'],
    ['empty', null],
  ])('still shows an Orbit notification when the payload is %s', async (_, text) => {
    const worker = loadServiceWorker()

    await worker.push(text)

    expect(worker.scope.registration.showNotification).toHaveBeenCalledWith('Orbit', {
      icon: '/pwa-192x192.png',
      data: {},
    })
  })

  it('tells every open Orbit window that a push arrived', async () => {
    const windows = [createWindowClient(), createWindowClient()]
    const worker = loadServiceWorker(windows)

    await worker.push('{"title":"Drink water","body":"Log it now"}')

    expect(worker.scope.clients.matchAll).toHaveBeenCalledWith({
      type: 'window',
      includeUncontrolled: true,
    })
    for (const client of windows) {
      expect(client.postMessage).toHaveBeenCalledWith({ type: 'orbit:push-received' })
    }
  })

  it('hands a click to the most recently focused Orbit window', async () => {
    const focused = createWindowClient()
    const other = createWindowClient()
    const worker = loadServiceWorker([focused, other])

    const notification = await worker.click({ url: '/profile' })

    expect(notification.close).toHaveBeenCalledTimes(1)
    expect(focused.postMessage).toHaveBeenCalledWith({
      type: 'orbit:notification-click',
      url: '/profile',
    })
    expect(focused.focus).toHaveBeenCalledTimes(1)
    expect(other.postMessage).not.toHaveBeenCalled()
    expect(worker.scope.clients.openWindow).not.toHaveBeenCalled()
  })

  it('focuses the open window without a message when the push had no url', async () => {
    const client = createWindowClient()
    const worker = loadServiceWorker([client])

    await worker.click({})

    expect(client.focus).toHaveBeenCalledTimes(1)
    expect(client.postMessage).not.toHaveBeenCalled()
  })

  it('opens the app with the url for the app to route when no window is open', async () => {
    const worker = loadServiceWorker()

    const notification = await worker.click({ url: '/progress' })

    expect(notification.close).toHaveBeenCalledTimes(1)
    expect(worker.scope.clients.openWindow).toHaveBeenCalledWith('/?notificationUrl=%2Fprogress')
  })

  it('opens the app root when no window is open and the push had no url', async () => {
    const worker = loadServiceWorker()

    await worker.click({})

    expect(worker.scope.clients.openWindow).toHaveBeenCalledWith('/')
  })
})
