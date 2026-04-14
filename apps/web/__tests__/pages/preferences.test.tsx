import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks -- must come before component import
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
  useLocale: () => 'en',
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
    refresh: vi.fn(),
  }),
}))

let mockProfile: Record<string, unknown> | null = null
let mockPushPreferences = {
  supported: false,
  subscribed: false,
  permission: '' as NotificationPermission | '',
  loading: false,
  status: 'unsupported' as
    | 'unsupported'
    | 'denied'
    | 'not-registered'
    | 'registered'
    | 'sync-failed'
    | 'requesting',
  togglePush: vi.fn(async () => undefined),
}

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: mockProfile,
    patchProfile: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({
    currentScheme: 'purple',
    applyScheme: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-push-notification-preferences', () => ({
  usePushNotificationPreferences: () => mockPushPreferences,
  getPushStatusTone: (status: string) => `tone:${status}`,
  getPushStatusMessageKey: (status: string, permission: NotificationPermission | '') => {
    if (status === 'denied') return 'settings.notifications.denied'
    if (status === 'requesting') return 'settings.notifications.requesting'
    if (status === 'registered') return 'settings.notifications.registered'
    if (status === 'sync-failed') return 'settings.notifications.syncFailed'
    if (status === 'not-registered' && permission === 'granted') {
      return 'settings.notifications.notRegistered'
    }

    return 'settings.notifications.disabled'
  },
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => boolean) =>
    selector({ isAuthenticated: true }),
}))

vi.mock('@/components/ui/pro-badge', () => ({
  ProBadge: () => <span data-testid="pro-badge">PRO</span>,
}))

vi.mock('@orbit/shared/theme', () => ({
  colorSchemeOptions: [
    { value: 'purple', color: '#8b5cf6' },
    { value: 'blue', color: '#3b82f6' },
    { value: 'green', color: '#22c55e' },
  ],
}))

vi.mock('@tanstack/react-query', () => ({
  useMutation: ({ mutationFn }: { mutationFn: (...args: unknown[]) => unknown }) => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
    mutateAsync: mutationFn,
  }),
}))

vi.mock('@/app/actions/profile', () => ({
  updateWeekStartDay: vi.fn().mockResolvedValue({}),
  updateColorScheme: vi.fn().mockResolvedValue({}),
  updateLanguage: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import PreferencesPage from '@/app/(app)/preferences/page'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PreferencesPage', () => {
  beforeEach(() => {
    mockProfile = {
      id: 'u1',
      weekStartDay: 1,
      colorScheme: 'purple',
      hasProAccess: true,
    }
    mockPushPreferences = {
      supported: false,
      subscribed: false,
      permission: '',
      loading: false,
      status: 'unsupported',
      togglePush: vi.fn(async () => undefined),
    }
    mockPush.mockClear()
    localStorage.clear()
  })

  it('renders without crashing', () => {
    const { container } = render(<PreferencesPage />)
    expect(container).toBeTruthy()
  })

  it('renders the page header with title and back button', () => {
    render(<PreferencesPage />)
    expect(screen.getByText('preferences.title')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'common.backToProfile' })).toBeInTheDocument()
  })

  // ---- Language section ----

  it('renders language section', () => {
    render(<PreferencesPage />)
    expect(screen.getByText('profile.language.title')).toBeInTheDocument()
    expect(screen.getByText('profile.language.description')).toBeInTheDocument()
  })

  it('renders language buttons', () => {
    render(<PreferencesPage />)
    expect(screen.getByText('English')).toBeInTheDocument()
    expect(screen.getByText('Portugu\u00eas')).toBeInTheDocument()
  })

  it('marks selected language with aria-pressed', () => {
    render(<PreferencesPage />)
    const enButton = screen.getByText('English')
    expect(enButton).toHaveAttribute('aria-pressed', 'true')
  })

  // ---- Color Scheme section ----

  it('renders color scheme section with ProBadge', () => {
    render(<PreferencesPage />)
    expect(screen.getByText('profile.colorScheme.title')).toBeInTheDocument()
    expect(screen.getByText('profile.colorScheme.description')).toBeInTheDocument()
    expect(screen.getByTestId('pro-badge')).toBeInTheDocument()
  })

  it('renders color scheme buttons for each option', () => {
    render(<PreferencesPage />)
    const colorButtons = screen.getAllByRole('button').filter(
      (btn) => btn.getAttribute('aria-label')?.startsWith('preferences.color'),
    )
    expect(colorButtons.length).toBe(3)
  })

  it('redirects to upgrade when non-Pro user clicks non-purple scheme', () => {
    mockProfile = { ...mockProfile, hasProAccess: false }
    render(<PreferencesPage />)
    const blueButton = screen.getAllByRole('button').find(
      (btn) => btn.getAttribute('aria-label') === 'preferences.colorBlue',
    )
    if (blueButton) fireEvent.click(blueButton)
    expect(mockPush).toHaveBeenCalledWith('/upgrade')
  })

  // ---- Week Start Day section ----

  it('renders week start day section', () => {
    render(<PreferencesPage />)
    expect(screen.getByText('settings.weekStartDay.title')).toBeInTheDocument()
    expect(screen.getByText('settings.weekStartDay.description')).toBeInTheDocument()
  })

  it('renders monday and sunday options', () => {
    render(<PreferencesPage />)
    expect(screen.getByText('settings.weekStartDay.monday')).toBeInTheDocument()
    expect(screen.getByText('settings.weekStartDay.sunday')).toBeInTheDocument()
  })

  it('marks current week start day as selected', () => {
    render(<PreferencesPage />)
    const mondayButton = screen.getByText('settings.weekStartDay.monday')
    expect(mondayButton).toHaveAttribute('aria-pressed', 'true')
  })

  // ---- Home Screen section ----

  it('renders home screen toggle', () => {
    render(<PreferencesPage />)
    expect(screen.getByText('settings.homeScreen.title')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'settings.homeScreen.showGeneral' })).toBeInTheDocument()
  })

  it('toggle defaults to off (unchecked)', () => {
    render(<PreferencesPage />)
    const toggle = screen.getByRole('switch', { name: 'settings.homeScreen.showGeneral' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('toggles home screen setting on click', () => {
    render(<PreferencesPage />)
    const toggle = screen.getByRole('switch', { name: 'settings.homeScreen.showGeneral' })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('persists home screen toggle to localStorage', () => {
    render(<PreferencesPage />)
    const toggle = screen.getByRole('switch', { name: 'settings.homeScreen.showGeneral' })
    fireEvent.click(toggle)
    expect(localStorage.getItem('orbit_show_general_on_today')).toBe('true')
  })

  it('persists false after toggling the home screen setting off again', () => {
    render(<PreferencesPage />)
    const toggle = screen.getByRole('switch', { name: 'settings.homeScreen.showGeneral' })
    fireEvent.click(toggle)
    fireEvent.click(toggle)
    expect(localStorage.getItem('orbit_show_general_on_today')).toBe('false')
  })

  it('renders the push notification section when web push is supported', () => {
    mockPushPreferences = {
      ...mockPushPreferences,
      supported: true,
      permission: 'granted',
      subscribed: true,
      status: 'registered',
    }

    render(<PreferencesPage />)

    expect(screen.getByText('settings.notifications.title')).toBeInTheDocument()
    expect(screen.getByText('settings.notifications.registered')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'settings.notifications.title' })).toHaveAttribute('aria-checked', 'true')
  })

  it('hides the push toggle when notification permission is denied', () => {
    mockPushPreferences = {
      ...mockPushPreferences,
      supported: true,
      permission: 'denied',
      subscribed: false,
      status: 'denied',
    }

    render(<PreferencesPage />)

    expect(screen.getByText('settings.notifications.denied')).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'settings.notifications.title' })).not.toBeInTheDocument()
  })

  // ---- Null profile edge case ----

  it('renders with null profile without crashing', () => {
    mockProfile = null
    const { container } = render(<PreferencesPage />)
    expect(container).toBeTruthy()
    expect(screen.getByText('preferences.title')).toBeInTheDocument()
  })
})
