import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { notificationKeys } from '@orbit/shared/query'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockCaptureException = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}))

import { useUIStore } from '@/stores/ui-store'
import { ServiceWorkerBridge } from '@/components/service-worker-bridge'

function installServiceWorkerContainer(register = vi.fn().mockResolvedValue({})) {
  const container = Object.assign(new EventTarget(), { register })
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: container,
  })
  return container
}

function renderBridge() {
  const queryClient = new QueryClient()
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ServiceWorkerBridge />
    </QueryClientProvider>,
  )
  return { ...view, invalidateQueries }
}

function postFromWorker(container: EventTarget, data: unknown, ports: MessagePort[] = []) {
  act(() => {
    container.dispatchEvent(Object.assign(new Event('message'), { data, ports }))
  })
}

/** The reply port `public/sw.js` sends with a click, so it can tell a window with no bridge from one that took it. */
function createReplyPort() {
  const channel = new MessageChannel()
  const receipts: unknown[] = []
  channel.port1.onmessage = (event) => receipts.push(event.data)
  return {
    port: channel.port2,
    receipts: async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      channel.port1.close()
      return receipts
    },
  }
}

describe('ServiceWorkerBridge', () => {
  beforeEach(() => {
    useUIStore.setState({ astraConversationOpen: false })
    mockPush.mockReset()
    mockCaptureException.mockReset()
    window.history.replaceState(null, '', '/')
  })

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'serviceWorker')
  })

  it('registers the push worker once for the whole origin', () => {
    const container = installServiceWorkerContainer()

    renderBridge()

    expect(container.register).toHaveBeenCalledTimes(1)
    expect(container.register).toHaveBeenCalledWith('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })
  })

  it('renders without a service worker API', () => {
    expect('serviceWorker' in navigator).toBe(false)

    expect(() => renderBridge()).not.toThrow()
  })

  it('reports a failed registration instead of dropping it', async () => {
    const failure = new TypeError('Failed to register a ServiceWorker')
    installServiceWorkerContainer(vi.fn().mockRejectedValue(failure))

    renderBridge()

    await vi.waitFor(() => expect(mockCaptureException).toHaveBeenCalledWith(failure))
  })

  it('routes a notification click through the shared destination rule', () => {
    const container = installServiceWorkerContainer()
    renderBridge()

    postFromWorker(container, { type: 'orbit:notification-click', url: '/chat' })
    postFromWorker(container, { type: 'orbit:notification-click', url: '/progress' })

    expect(mockPush.mock.calls).toEqual([['/'], ['/progress']])
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
  })

  it('confirms a notification click on the worker reply port, so the worker does not reload the window', async () => {
    const container = installServiceWorkerContainer()
    renderBridge()
    const reply = createReplyPort()

    postFromWorker(container, { type: 'orbit:notification-click', url: '/chat' }, [reply.port])

    expect(mockPush).toHaveBeenCalledWith('/')
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    expect(await reply.receipts()).toEqual([{ type: 'orbit:notification-click-received' }])
  })

  it('confirms a click the shared rule rejects, since the launch link would be rejected the same way', async () => {
    const container = installServiceWorkerContainer()
    renderBridge()
    const reply = createReplyPort()

    postFromWorker(container, { type: 'orbit:notification-click', url: '//evil.example' }, [reply.port])

    expect(mockPush).not.toHaveBeenCalled()
    expect(await reply.receipts()).toEqual([{ type: 'orbit:notification-click-received' }])
  })

  it.each(['/social/x', '//evil.example', 'https://evil.example', 42])(
    'does not navigate for a rejected url %s',
    (url) => {
      const container = installServiceWorkerContainer()
      renderBridge()

      postFromWorker(container, { type: 'orbit:notification-click', url })

      expect(mockPush).not.toHaveBeenCalled()
    },
  )

  it('ignores messages that are not from the push worker contract', () => {
    const container = installServiceWorkerContainer()
    const { invalidateQueries } = renderBridge()

    postFromWorker(container, null)
    postFromWorker(container, 'orbit:push-received')
    postFromWorker(container, { type: 'other', url: '/chat' })

    expect(mockPush).not.toHaveBeenCalled()
    expect(invalidateQueries).not.toHaveBeenCalled()
  })

  it('refreshes the notification list when a push arrives', () => {
    const container = installServiceWorkerContainer()
    const { invalidateQueries } = renderBridge()

    postFromWorker(container, { type: 'orbit:push-received' })

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: notificationKeys.lists() })
  })

  it('stops listening after unmount', () => {
    const container = installServiceWorkerContainer()
    const { unmount, invalidateQueries } = renderBridge()

    unmount()
    postFromWorker(container, { type: 'orbit:push-received' })
    postFromWorker(container, { type: 'orbit:notification-click', url: '/chat' })

    expect(invalidateQueries).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('opens the destination a new window was launched for, then clears it from the address bar', () => {
    installServiceWorkerContainer()
    window.history.replaceState(null, '', '/?date=2026-09-29&notificationUrl=%2Fprofile')

    renderBridge()

    expect(mockPush).toHaveBeenCalledWith('/profile')
    expect(window.location.pathname).toBe('/')
    expect(window.location.search).toBe('?date=2026-09-29')
  })

  it('opens Astra for a conversation notification in a newly launched window', () => {
    installServiceWorkerContainer()
    window.history.replaceState(null, '', '/?notificationUrl=%2Fchat')
    renderBridge()
    expect(mockPush).toHaveBeenCalledWith('/')
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
  })

  it('stays on the origin for a crafted launch link and still clears it', () => {
    installServiceWorkerContainer()
    window.history.replaceState(null, '', '/?notificationUrl=%2F%2Fevil.example')

    renderBridge()

    expect(mockPush).not.toHaveBeenCalled()
    expect(window.location.href).toBe(`${window.location.origin}/`)
  })
})
