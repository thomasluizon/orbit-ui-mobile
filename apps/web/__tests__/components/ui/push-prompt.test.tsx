import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { installWebLocks } from '../../helpers/web-locks'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))


vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>()
  return {
    ...actual,
    BellRing: (props: Record<string, unknown>) => <svg data-testid="bell-ring" {...props} />,
    X: (props: Record<string, unknown>) => <svg data-testid="x-icon" {...props} />,
  }
})

vi.mock('@/lib/actions/notifications', () => ({
  subscribePush: vi.fn().mockResolvedValue(undefined),
}))

import { PushPrompt } from '@/components/ui/push-prompt'
import { subscribeToPushNotifications } from '@/hooks/use-push-notification-preferences'
import { subscribePush } from '@/lib/actions/notifications'
import { setAccountId } from '@/lib/account-scope'
import { useUIStore } from '@/stores/ui-store'

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

/** Mirrors the browser: `ready` never settles until something registers a worker for the page. */
function createServiceWorkerContainer(pushManager: Record<string, unknown>, registerRejects = false) {
  const registration = { pushManager }
  let activate: (value: typeof registration) => void = () => undefined
  const ready = new Promise<typeof registration>((resolve) => {
    activate = resolve
  })
  const register = registerRejects
    ? vi.fn().mockRejectedValue(new TypeError('Failed to register a ServiceWorker'))
    : vi.fn(async () => {
        activate(registration)
        return registration
      })
  return { ready, register }
}

/**
 * Turns push on through the real subscribe flow as the given account, which is how a browser comes to
 * hold a subscription that belongs to one account.
 */
async function enablePushAs(accountId: string) {
  let current: Record<string, unknown> | null = null
  const created = {
    endpoint: 'https://push.example.com/current',
    toJSON: () => ({ endpoint: 'https://push.example.com/current' }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    value: createServiceWorkerContainer({
      getSubscription: vi.fn(async () => current),
      subscribe: vi.fn(async () => {
        current = created
        return created
      }),
    }),
    writable: true,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'PushManager', {
    value: class {},
    writable: true,
    configurable: true,
  })
  mockNotificationPermission = 'granted'
  setAccountId(accountId)
  await subscribeToPushNotifications('dGVzdA')
}

describe('PushPrompt', () => {
  beforeEach(() => {
    installWebLocks()
    useUIStore.setState({ openOverlayIds: [], showCreateModal: false, showCreateGoalModal: false })
    vi.clearAllMocks()
    setAccountId('account-a')
    localStorage.clear()
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
      value: createServiceWorkerContainer({ getSubscription: () => Promise.resolve(null) }),
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
      value: createServiceWorkerContainer({ getSubscription: () => Promise.resolve(null) }),
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
      value: createServiceWorkerContainer({ getSubscription: () => Promise.resolve(null) }),
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

  it('waits for the create modal to close before showing', async () => {
    useUIStore.getState().setShowCreateModal(true)
    Object.defineProperty(navigator, 'serviceWorker', {
      value: createServiceWorkerContainer({ getSubscription: () => Promise.resolve(null) }),
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis, 'PushManager', {
      value: class {},
      writable: true,
      configurable: true,
    })

    render(<PushPrompt />)
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByText('pushPrompt.title')).toBeNull()

    await act(async () => { useUIStore.getState().setShowCreateModal(false) })
    await waitFor(() => expect(screen.getByText('pushPrompt.title')).toBeInTheDocument())
  })

  it('hides the prompt when dismiss (later) button is clicked', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: createServiceWorkerContainer({ getSubscription: () => Promise.resolve(null) }),
      writable: true,
      configurable: true,
    })
    Object.defineProperty(globalThis, 'PushManager', {
      value: class {},
      writable: true,
      configurable: true,
    })
    mockNotificationPermission = 'default'

    const { unmount } = render(<PushPrompt />)

    await waitFor(() => {
      expect(screen.getByText('pushPrompt.later')).toBeInTheDocument()
    })

    await waitFor(() => {
      const dialog = screen.getByRole('dialog')
      expect(dialog.style.opacity).toBe('1')
    })

    vi.useFakeTimers()
    try {
      fireEvent.click(screen.getByText('pushPrompt.later'))
      expect(screen.getByRole('dialog').style.opacity).toBe('0')

      unmount()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('hides the prompt when X button is clicked', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: createServiceWorkerContainer({ getSubscription: () => Promise.resolve(null) }),
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
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('does not show prompt when this account already turned push on with granted permission', async () => {
    await enablePushAs('account-a')

    const { container } = render(<PushPrompt />)

    await new Promise((r) => setTimeout(r, 50))
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('offers the prompt when the browser subscription belongs to another account', async () => {
    await enablePushAs('account-a')
    setAccountId('account-b')

    render(<PushPrompt />)

    expect(await screen.findByText('pushPrompt.enable')).toBeInTheDocument()
  })

  it('offers a foreign subscription even when the prior account dismissed the prompt', async () => {
    await enablePushAs('account-a')
    document.cookie = 'orbit_push_prompted=1; path=/; Secure'
    setAccountId('account-b')

    render(<PushPrompt />)

    expect(await screen.findByText('pushPrompt.enable')).toBeInTheDocument()
  })

  it('shows prompt when getSubscription throws an error and permission is not granted', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: createServiceWorkerContainer({ getSubscription: () => Promise.reject(new Error('fail')) }),
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

  function mountEnableFlow(pushManager: Record<string, unknown>, registerRejects = false) {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: createServiceWorkerContainer(pushManager, registerRejects),
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
    installWebLocks()
    vi.clearAllMocks()
    setAccountId('account-a')
    localStorage.clear()
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

  it('presents a foreign subscription and its device keys without rotating the endpoint', async () => {
    const existing = {
      toJSON: () => ({ endpoint: 'https://push.example.com/previous', expirationTime: null, keys: { p256dh: 'device-key', auth: 'device-auth' } }),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
    }
    const created = { toJSON: () => ({ endpoint: 'https://push.example.com/new' }) }
    const subscribe = vi.fn().mockResolvedValue(created)
    vi.spyOn(MockNotification, 'requestPermission').mockResolvedValue('granted')
    mountEnableFlow({ getSubscription: vi.fn().mockResolvedValue(existing), subscribe })

    render(<PushPrompt />)
    fireEvent.click(await screen.findByText('pushPrompt.enable'))

    await waitFor(() => {
      expect(subscribePush).toHaveBeenCalledWith(existing.toJSON())
    })
    expect(existing.unsubscribe).not.toHaveBeenCalled()
    expect(subscribe).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('dismisses without subscribing when permission is refused', async () => {
    vi.spyOn(MockNotification, 'requestPermission').mockResolvedValue('denied')
    mountEnableFlow({ getSubscription: vi.fn().mockResolvedValue(null), subscribe: vi.fn() })

    render(<PushPrompt />)
    fireEvent.click(await screen.findByText('pushPrompt.enable'))

    await waitFor(() => expect(screen.getByRole('dialog').style.opacity).toBe('0'))
    expect(subscribePush).not.toHaveBeenCalled()
  })

  it('offers a retry without prompting for permission when the VAPID key is missing', async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const requestPermission = vi.spyOn(MockNotification, 'requestPermission')
    const subscribe = vi.fn()
    mountEnableFlow({ getSubscription: vi.fn().mockResolvedValue(null), subscribe })

    render(<PushPrompt />)
    fireEvent.click(await screen.findByText('pushPrompt.enable'))

    expect(await screen.findByRole('alert')).toHaveTextContent('pushPrompt.retryHint')
    expect(requestPermission).not.toHaveBeenCalled()
    expect(subscribe).not.toHaveBeenCalled()
    expect(subscribePush).not.toHaveBeenCalled()
  })

  it('offers a retry instead of hanging when the worker cannot register', async () => {
    vi.spyOn(MockNotification, 'requestPermission').mockResolvedValue('granted')
    const subscribe = vi.fn()
    mountEnableFlow({ getSubscription: vi.fn().mockResolvedValue(null), subscribe }, true)

    render(<PushPrompt />)
    fireEvent.click(await screen.findByText('pushPrompt.enable'))

    expect(await screen.findByRole('alert')).toHaveTextContent('pushPrompt.retryHint')
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

  it('keeps the prompt without a retry hint when the account changed', async () => {
    vi.spyOn(MockNotification, 'requestPermission').mockResolvedValue('granted')
    mountEnableFlow({
      getSubscription: vi.fn().mockResolvedValue(null),
      subscribe: vi.fn().mockResolvedValue({
        toJSON: () => ({ endpoint: 'https://push.example.com/new' }),
        unsubscribe: vi.fn().mockResolvedValue(true),
      }),
    })
    vi.mocked(subscribePush).mockRejectedValueOnce(Object.assign(new Error('Account changed'), { code: 'ACCOUNT_CHANGED' }))
    render(<PushPrompt />)
    fireEvent.click(await screen.findByText('pushPrompt.enable'))
    await waitFor(() => expect(subscribePush).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog').style.opacity).toBe('1')
  })

  it('removes the refused browser subscription so a reload offers the prompt again', async () => {
    let current: { unsubscribe: () => Promise<boolean>; toJSON: () => object } | null = null
    const created = {
      toJSON: () => ({ endpoint: 'https://push.example.com/new' }),
      unsubscribe: vi.fn(async () => {
        current = null
        return true
      }),
    }
    const subscribe = vi.fn(async () => {
      current = created
      return created
    })
    vi.spyOn(MockNotification, 'requestPermission').mockResolvedValue('granted')
    mountEnableFlow({ getSubscription: vi.fn(async () => current), subscribe })
    vi.mocked(subscribePush).mockRejectedValueOnce(Object.assign(new Error('Account changed'), { code: 'ACCOUNT_CHANGED' }))

    const firstMount = render(<PushPrompt />)
    fireEvent.click(await screen.findByText('pushPrompt.enable'))
    await waitFor(() => expect(created.unsubscribe).toHaveBeenCalledTimes(1))
    firstMount.unmount()

    mockNotificationPermission = 'granted'
    render(<PushPrompt />)
    expect(await screen.findByText('pushPrompt.enable')).toBeInTheDocument()
  })
})
