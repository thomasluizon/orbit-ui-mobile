import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))


vi.mock('@/components/ui/icons', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/icons')>()
  return {
    ...actual,
    BellRing: (props: Record<string, unknown>) => <svg data-testid="bell-ring" {...props} />,
    X: (props: Record<string, unknown>) => <svg data-testid="x-icon" {...props} />,
  }
})

vi.mock('@/app/actions/notifications', () => ({
  subscribePush: vi.fn().mockResolvedValue(undefined),
}))

import { PushPrompt } from '@/components/ui/push-prompt'
import { subscribePush } from '@/app/actions/notifications'

let mockNotificationPermission = 'default' as NotificationPermission

class MockNotification {
  static get permission() {
    return mockNotificationPermission
  }
  static requestPermission() {
    return Promise.resolve(mockNotificationPermission)
  }
}

Object.defineProperty(globalThis, 'Notification', {
  value: MockNotification,
  writable: true,
  configurable: true,
})

describe('PushPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNotificationPermission = 'default'
    Object.defineProperty(navigator, 'serviceWorker', {
      value: undefined,
      writable: true,
      configurable: true,
    })
    Reflect.deleteProperty(globalThis, 'PushManager')
    document.cookie = 'orbit_push_prompted=; max-age=0'
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'PushManager')
    Object.defineProperty(navigator, 'serviceWorker', {
      value: undefined,
      writable: true,
      configurable: true,
    })
  })

  it('renders nothing initially (no SW support)', () => {
    const { container } = render(<PushPrompt />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when Notification permission is denied', () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({ pushManager: { getSubscription: () => Promise.resolve(null) } }) },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis, 'PushManager', {
      value: class {},
      writable: true,
      configurable: true,
    })
    mockNotificationPermission = 'denied'

    const { container } = render(<PushPrompt />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when already prompted (cookie set)', () => {
    document.cookie = 'orbit_push_prompted=1; path=/; max-age=31536000'
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({ pushManager: { getSubscription: () => Promise.resolve(null) } }) },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis, 'PushManager', {
      value: class {},
      writable: true,
      configurable: true,
    })
    mockNotificationPermission = 'default'

    const { container } = render(<PushPrompt />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the prompt when SW is supported, permission is default, not yet prompted', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({ pushManager: { getSubscription: () => Promise.resolve(null) } }) },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis, 'PushManager', {
      value: class {},
      writable: true,
      configurable: true,
    })
    mockNotificationPermission = 'default'

    render(<PushPrompt />)

    await waitFor(() => {
      expect(screen.getByText('pushPrompt.title')).toBeInTheDocument()
      expect(screen.getByText('pushPrompt.description')).toBeInTheDocument()
      expect(screen.getByText('pushPrompt.enable')).toBeInTheDocument()
      expect(screen.getByText('pushPrompt.later')).toBeInTheDocument()
    })
  })

  it('hides the prompt when dismiss (later) button is clicked', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({ pushManager: { getSubscription: () => Promise.resolve(null) } }) },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis, 'PushManager', {
      value: class {},
      writable: true,
      configurable: true,
    })
    mockNotificationPermission = 'default'

    render(<PushPrompt />)

    await waitFor(() => {
      expect(screen.getByText('pushPrompt.later')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('pushPrompt.later'))

    await waitFor(() => {
      const dialog = screen.getByRole('dialog')
      expect(dialog.style.opacity).toBe('0')
    })
  })

  it('hides the prompt when X button is clicked', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({ pushManager: { getSubscription: () => Promise.resolve(null) } }) },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis, 'PushManager', {
      value: class {},
      writable: true,
      configurable: true,
    })
    mockNotificationPermission = 'default'

    render(<PushPrompt />)

    await waitFor(() => {
      expect(screen.getByTestId('x-icon')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('x-icon').closest('button')!)

    await waitFor(() => {
      const dialog = screen.getByRole('dialog')
      expect(dialog.style.opacity).toBe('0')
    })
  })

  it('does not show prompt when already subscribed with granted permission', async () => {
    const mockSubscription = { endpoint: 'https://push.example.com' }
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({ pushManager: { getSubscription: () => Promise.resolve(mockSubscription) } }) },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis, 'PushManager', {
      value: class {},
      writable: true,
      configurable: true,
    })
    mockNotificationPermission = 'granted'

    const { container } = render(<PushPrompt />)

    await new Promise((r) => setTimeout(r, 50))
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('shows prompt when getSubscription throws an error and permission is not granted', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({ pushManager: { getSubscription: () => Promise.reject(new Error('fail')) } }) },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis, 'PushManager', {
      value: class {},
      writable: true,
      configurable: true,
    })
    mockNotificationPermission = 'default'

    render(<PushPrompt />)

    await waitFor(() => {
      expect(screen.getByText('pushPrompt.title')).toBeInTheDocument()
    })
  })
})

describe('PushPrompt enable flow', () => {
  const originalVapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  function mountEnableFlow(pushManager: Record<string, unknown>) {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({ pushManager }) },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis, 'PushManager', {
      value: class {},
      writable: true,
      configurable: true,
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockNotificationPermission = 'default'
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'dGVzdA'
    document.cookie = 'orbit_push_prompted=; max-age=0'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(globalThis, 'PushManager')
    Object.defineProperty(navigator, 'serviceWorker', {
      value: undefined,
      writable: true,
      configurable: true,
    })
    if (originalVapid === undefined) {
      delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      return
    }
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = originalVapid
  })

  it('replaces a stale subscription, registers a fresh one and syncs the backend', async () => {
    const existing = { unsubscribe: vi.fn().mockResolvedValue(undefined) }
    const created = { toJSON: () => ({ endpoint: 'https://push.example.com/new' }) }
    const subscribe = vi.fn().mockResolvedValue(created)
    vi.spyOn(MockNotification, 'requestPermission').mockResolvedValue('granted')
    mountEnableFlow({ getSubscription: vi.fn().mockResolvedValue(existing), subscribe })

    render(<PushPrompt />)
    fireEvent.click(await screen.findByText('pushPrompt.enable'))

    await waitFor(() => {
      expect(existing.unsubscribe).toHaveBeenCalledTimes(1)
      expect(subscribe).toHaveBeenCalledTimes(1)
      expect(subscribePush).toHaveBeenCalledWith({ endpoint: 'https://push.example.com/new' })
    })
  })

  it('dismisses without subscribing when permission is refused', async () => {
    vi.spyOn(MockNotification, 'requestPermission').mockResolvedValue('denied')
    mountEnableFlow({ getSubscription: vi.fn().mockResolvedValue(null), subscribe: vi.fn() })

    render(<PushPrompt />)
    fireEvent.click(await screen.findByText('pushPrompt.enable'))

    await waitFor(() => expect(screen.getByRole('dialog').style.opacity).toBe('0'))
    expect(subscribePush).not.toHaveBeenCalled()
  })

  it('dismisses without subscribing when the VAPID key is missing', async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    vi.spyOn(MockNotification, 'requestPermission').mockResolvedValue('granted')
    const subscribe = vi.fn()
    mountEnableFlow({ getSubscription: vi.fn().mockResolvedValue(null), subscribe })

    render(<PushPrompt />)
    fireEvent.click(await screen.findByText('pushPrompt.enable'))

    await waitFor(() => expect(screen.getByRole('dialog').style.opacity).toBe('0'))
    expect(subscribe).not.toHaveBeenCalled()
    expect(subscribePush).not.toHaveBeenCalled()
  })

  it('surfaces a retry hint when subscription registration throws', async () => {
    vi.spyOn(MockNotification, 'requestPermission').mockResolvedValue('granted')
    mountEnableFlow({
      getSubscription: vi.fn().mockResolvedValue(null),
      subscribe: vi.fn().mockRejectedValue(new Error('registration failed')),
    })

    render(<PushPrompt />)
    fireEvent.click(await screen.findByText('pushPrompt.enable'))

    expect(await screen.findByRole('alert')).toHaveTextContent('pushPrompt.retryHint')
    await waitFor(() => expect(screen.getByRole('dialog').style.opacity).toBe('1'))
  })
})
