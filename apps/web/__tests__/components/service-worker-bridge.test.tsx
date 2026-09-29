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

function postFromWorker(container: EventTarget, data: unknown) {
  act(() => {
    container.dispatchEvent(new MessageEvent('message', { data }))
  })
}

describe('ServiceWorkerBridge', () => {
  beforeEach(() => {
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

    expect(mockPush.mock.calls).toEqual([['/chat'], ['/streak']])
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

  it('stays on the origin for a crafted launch link and still clears it', () => {
    installServiceWorkerContainer()
    window.history.replaceState(null, '', '/?notificationUrl=%2F%2Fevil.example')

    renderBridge()

    expect(mockPush).not.toHaveBeenCalled()
    expect(window.location.href).toBe(`${window.location.origin}/`)
  })
})
