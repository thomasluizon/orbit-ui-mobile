import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileFunction } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'

type Listener = (event: unknown) => void

interface FakeWindowClient {
  focus: ReturnType<typeof vi.fn>
  navigate: ReturnType<typeof vi.fn>
  postMessage: ReturnType<typeof vi.fn>
}

/**
 * A window whose app mounted the service worker bridge confirms a click on the reply port the worker
 * sends with it. A login page, or a page still loading, has no bridge and never confirms.
 */
function createWindowClient({ confirmsClicks = true } = {}): FakeWindowClient {
  const client: FakeWindowClient = {
    focus: vi.fn(),
    navigate: vi.fn(),
    postMessage: vi.fn((_message: unknown, transfer: MessagePort[] = []) => {
      if (confirmsClicks) transfer[0]?.postMessage({ type: 'orbit:notification-click-received' })
    }),
  }
  client.focus.mockResolvedValue(client)
  client.navigate.mockResolvedValue(client)
  return client
}

interface OpenWindows {
  controlled: FakeWindowClient[]
  uncontrolled?: FakeWindowClient[]
}

/** Evaluates the shipped `public/sw.js` against a fake worker global scope. */
function loadServiceWorker(windows: FakeWindowClient[] | OpenWindows = []) {
  const { controlled, uncontrolled = [] } = Array.isArray(windows) ? { controlled: windows } : windows
  const source = readFileSync(resolve(__dirname, '../public/sw.js'), 'utf8')
  const listeners = new Map<string, Listener>()
  const scope = {
    addEventListener: vi.fn((type: string, listener: Listener) => {
      listeners.set(type, listener)
    }),
    registration: { showNotification: vi.fn().mockResolvedValue(undefined) },
    clients: {
      claim: vi.fn().mockResolvedValue(undefined),
      matchAll: vi.fn(async (options: { includeUncontrolled?: boolean }) =>
        options.includeUncontrolled ? [...controlled, ...uncontrolled] : controlled,
      ),
      openWindow: vi.fn().mockResolvedValue(null),
    },
  }
  compileFunction(source, ['self'])(scope)

  function start(type: string, event: Record<string, unknown>): Promise<unknown> {
    const waitUntil = vi.fn()
    listeners.get(type)?.({ ...event, waitUntil })
    expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise))
    return waitUntil.mock.calls[0]![0] as Promise<unknown>
  }

  function startClick(notificationData: Record<string, unknown>) {
    const notification = { data: notificationData, close: vi.fn() }
    return { notification, handled: start('notificationclick', { notification }) }
  }

  return {
    scope,
    activate: () => start('activate', {}),
    push: (text: string | null) =>
      start('push', {
        data: text === null ? null : { json: () => JSON.parse(text), text: () => text },
      }),
    startClick,
    click: async (notificationData: Record<string, unknown>) => {
      const { notification, handled } = startClick(notificationData)
      await handled
      return notification
    },
  }
}

describe('push service worker', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

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

  it('tells every open Orbit window that a push arrived, controlled or not', async () => {
    const controlled = createWindowClient()
    const hardReloaded = createWindowClient()
    const worker = loadServiceWorker({ controlled: [controlled], uncontrolled: [hardReloaded] })

    await worker.push('{"title":"Drink water","body":"Log it now"}')

    for (const client of [controlled, hardReloaded]) {
      expect(client.postMessage).toHaveBeenCalledWith({ type: 'orbit:push-received' })
    }
  })

  it('takes control of the open Orbit windows once it activates', async () => {
    const worker = loadServiceWorker()

    await worker.activate()

    expect(worker.scope.clients.claim).toHaveBeenCalledTimes(1)
  })

  it('hands a click to the most recently focused Orbit window', async () => {
    const focused = createWindowClient()
    const other = createWindowClient()
    const worker = loadServiceWorker([focused, other])

    const notification = await worker.click({ url: '/profile' })

    expect(notification.close).toHaveBeenCalledTimes(1)
    expect(focused.postMessage).toHaveBeenCalledWith(
      { type: 'orbit:notification-click', url: '/profile' },
      [expect.any(MessagePort)],
    )
    expect(focused.focus).toHaveBeenCalledTimes(1)
    expect(focused.navigate).not.toHaveBeenCalled()
    expect(other.postMessage).not.toHaveBeenCalled()
    expect(worker.scope.clients.openWindow).not.toHaveBeenCalled()
  })

  it('loads the launch link in a focused window that never confirms the click', async () => {
    vi.useFakeTimers()
    const loginPage = createWindowClient({ confirmsClicks: false })
    const worker = loadServiceWorker([loginPage])

    const { handled } = worker.startClick({ url: '/profile' })
    await vi.advanceTimersByTimeAsync(0)
    expect(loginPage.postMessage).toHaveBeenCalledTimes(1)
    expect(loginPage.navigate).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    await handled

    expect(loginPage.focus).toHaveBeenCalledTimes(1)
    expect(loginPage.navigate).toHaveBeenCalledWith('/?notificationUrl=%2Fprofile')
    expect(worker.scope.clients.openWindow).not.toHaveBeenCalled()
  })

  it('opens a new window rather than pick a window it does not control and so cannot navigate', async () => {
    const hardReloaded = createWindowClient({ confirmsClicks: false })
    const worker = loadServiceWorker({ controlled: [], uncontrolled: [hardReloaded] })

    await worker.click({ url: '/profile' })

    expect(hardReloaded.focus).not.toHaveBeenCalled()
    expect(hardReloaded.postMessage).not.toHaveBeenCalled()
    expect(worker.scope.clients.openWindow).toHaveBeenCalledWith('/?notificationUrl=%2Fprofile')
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
