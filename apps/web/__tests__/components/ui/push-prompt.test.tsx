import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

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

import { PushPrompt } from '@/components/ui/push-prompt'

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
    document.cookie = 'orbit_push_prompted=; max-age=0'
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
