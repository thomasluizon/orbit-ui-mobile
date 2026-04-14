import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

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
const mockReplace = vi.fn()
const mockSearchParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
}))

vi.mock('@/lib/plural', () => ({
  plural: (text: string) => text,
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

let mockProfile: Record<string, unknown> | null = null
let mockHasProAccess = true
const mockSignInWithOAuth = vi.fn().mockResolvedValue({})

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mockProfile }),
  useHasProAccess: () => mockHasProAccess,
}))

const mockBulkMutate = vi.fn()
vi.mock('@/hooks/use-habits', () => ({
  useBulkCreateHabits: () => ({
    mutate: mockBulkMutate,
    isPending: false,
  }),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      signInWithOAuth: mockSignInWithOAuth,
    },
  }),
}))

vi.mock('@orbit/shared/api', () => ({
  API: {
    calendar: {
      events: '/api/calendar/events',
      dismiss: '/api/calendar/dismiss',
      autoSyncState: '/api/calendar/auto-sync/state',
      autoSync: '/api/calendar/auto-sync',
      autoSyncSuggestions: '/api/calendar/auto-sync/suggestions',
      autoSyncDismissSuggestion: (id: string) =>
        `/api/calendar/auto-sync/suggestions/${id}/dismiss`,
      autoSyncRun: '/api/calendar/auto-sync/run',
    },
  },
}))

// Default auto-sync hook state -- tests can override via the setters below
let mockAutoSyncState: {
  data:
    | {
        enabled: boolean
        status: 'Idle' | 'ReconnectRequired' | 'TransientError'
        lastSyncedAt: string | null
        hasGoogleConnection: boolean
      }
    | undefined
  isLoading: boolean
} = {
  data: {
    enabled: false,
    status: 'Idle',
    lastSyncedAt: null,
    hasGoogleConnection: true,
  },
  isLoading: false,
}
let mockSuggestions: { data: unknown[] | undefined; isLoading: boolean } = {
  data: [],
  isLoading: false,
}
const mockSetAutoSync = vi.fn()
const mockRunSyncNow = vi.fn()
const mockDismissSuggestion = vi.fn()

vi.mock('@/hooks/use-calendar-auto-sync', () => ({
  useCalendarAutoSyncState: () => mockAutoSyncState,
  useCalendarSyncSuggestions: () => mockSuggestions,
  useSetCalendarAutoSync: () => ({
    mutate: mockSetAutoSync,
    isPending: false,
  }),
  useRunCalendarSyncNow: () => ({
    mutate: mockRunSyncNow,
    isPending: false,
  }),
  useDismissCalendarSuggestion: () => ({
    mutate: mockDismissSuggestion,
    isPending: false,
  }),
}))

vi.mock('@orbit/shared/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/utils')>()
  return {
    ...actual,
    getErrorMessage: (err: unknown, fallback: string) => fallback,
  }
})

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Control fetch responses
let mockFetchResponse: { ok: boolean; status: number; json: () => Promise<unknown> } | null = null

const originalFetch = globalThis.fetch

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import CalendarSyncPage from '@/app/(app)/calendar-sync/page'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CalendarSyncPage', () => {
  beforeEach(() => {
    mockProfile = { id: 'u1', hasProAccess: true }
    mockHasProAccess = true
    mockPush.mockClear()
    mockReplace.mockClear()
    mockBulkMutate.mockClear()
    mockFetchResponse = null
    mockSearchParams.delete('mode')
    mockAutoSyncState = {
      data: {
        enabled: false,
        status: 'Idle',
        lastSyncedAt: null,
        hasGoogleConnection: true,
      },
      isLoading: false,
    }
    mockSuggestions = { data: [], isLoading: false }
    mockSetAutoSync.mockClear()
    mockRunSyncNow.mockClear()
    mockDismissSuggestion.mockClear()
    mockSignInWithOAuth.mockClear()

    // Default: loading state (fetch never resolves immediately)
    globalThis.fetch = vi.fn().mockImplementation(() => {
      if (mockFetchResponse) return Promise.resolve(mockFetchResponse)
      // Default: return an empty events array
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      })
    }) as unknown as typeof fetch
  })

  afterAll(() => {
    globalThis.fetch = originalFetch
  })

  it('renders without crashing', () => {
    const { container } = render(<CalendarSyncPage />)
    expect(container).toBeTruthy()
  })

  it('renders the page header with title and back button', () => {
    render(<CalendarSyncPage />)
    expect(screen.getByText('calendar.title')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'common.backToProfile' })).toBeInTheDocument()
  })

  // ---- Non-Pro redirect ----

  it('redirects non-Pro users to upgrade', async () => {
    mockHasProAccess = false
    mockProfile = { id: 'u1', hasProAccess: false }
    render(<CalendarSyncPage />)
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/upgrade')
    })
  })

  // ---- Loading state ----

  it('shows loading state initially for Pro users', () => {
    // Fetch takes time, so loading step is shown initially
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {})) as unknown as typeof fetch
    render(<CalendarSyncPage />)
    expect(screen.getByText('calendar.fetchingEvents')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  // ---- Not connected state ----

  it('shows not-connected state when API returns not connected error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Not connected' }),
    }) as unknown as typeof fetch

    render(<CalendarSyncPage />)
    await waitFor(() => {
      expect(screen.getByText('calendar.notConnectedTitle')).toBeInTheDocument()
    })
    expect(screen.getByText('calendar.notConnectedDesc')).toBeInTheDocument()
    expect(screen.getByText('auth.signInWithGoogle')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('requests renewed Google calendar consent from the not-connected state', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Google Calendar connection expired. Please reconnect.' }),
    }) as unknown as typeof fetch

    render(<CalendarSyncPage />)

    const connectButton = await screen.findByText('auth.signInWithGoogle')
    fireEvent.click(connectButton)

    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:3000/auth-callback',
        scopes: 'https://www.googleapis.com/auth/calendar.readonly',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
          include_granted_scopes: 'true',
        },
      },
    })
  })

  // ---- Empty events ----

  it('shows no events message when calendar has no events', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    }) as unknown as typeof fetch

    render(<CalendarSyncPage />)
    await waitFor(() => {
      expect(screen.getByText('calendar.noEvents')).toBeInTheDocument()
    })
    expect(screen.getByText('common.goBack')).toBeInTheDocument()
  })

  // ---- Event selection ----

  it('shows events when calendar returns data', async () => {
    const events = [
      { id: 'e1', title: 'Morning Workout', description: null, startDate: '2025-06-01', startTime: '08:00', endTime: '09:00', isRecurring: false, recurrenceRule: null, reminders: [] },
      { id: 'e2', title: 'Team Meeting', description: 'Weekly sync', startDate: '2025-06-01', startTime: '10:00', endTime: '11:00', isRecurring: true, recurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO', reminders: [15] },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(events),
    }) as unknown as typeof fetch

    render(<CalendarSyncPage />)
    await waitFor(() => {
      expect(screen.getByText('Morning Workout')).toBeInTheDocument()
    })
    expect(screen.getByText('Team Meeting')).toBeInTheDocument()
    expect(document.body.textContent).toContain('calendar.eventsFound')
    expect(screen.getAllByRole('button').some((button) => button.getAttribute('aria-pressed') === 'true')).toBe(true)
  })

  it('shows select all / deselect all toggle', async () => {
    const events = [
      { id: 'e1', title: 'Event 1', description: null, startDate: null, startTime: null, endTime: null, isRecurring: false, recurrenceRule: null, reminders: [] },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(events),
    }) as unknown as typeof fetch

    render(<CalendarSyncPage />)
    await waitFor(() => {
      expect(screen.getByText('calendar.deselectAll')).toBeInTheDocument()
    })
    expect(screen.getByText('calendar.deselectAll').closest('button')).toHaveAttribute('aria-pressed', 'true')
  })

  it('all events are selected by default', async () => {
    const events = [
      { id: 'e1', title: 'Event 1', description: null, startDate: null, startTime: null, endTime: null, isRecurring: false, recurrenceRule: null, reminders: [] },
      { id: 'e2', title: 'Event 2', description: null, startDate: null, startTime: null, endTime: null, isRecurring: false, recurrenceRule: null, reminders: [] },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(events),
    }) as unknown as typeof fetch

    render(<CalendarSyncPage />)
    await waitFor(() => {
      expect(screen.getByText('Event 1')).toBeInTheDocument()
    })

    // Initially all are selected, so deselect all toggle is shown
    expect(screen.getByText('calendar.deselectAll')).toBeInTheDocument()
    // Import button shows count matching total events
    expect(document.body.textContent).toContain('calendar.importButton')
  })

  it('renders import button with selected count', async () => {
    const events = [
      { id: 'e1', title: 'Event 1', description: null, startDate: null, startTime: null, endTime: null, isRecurring: false, recurrenceRule: null, reminders: [] },
      { id: 'e2', title: 'Event 2', description: null, startDate: null, startTime: null, endTime: null, isRecurring: false, recurrenceRule: null, reminders: [] },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(events),
    }) as unknown as typeof fetch

    render(<CalendarSyncPage />)
    await waitFor(() => {
      expect(document.body.textContent).toContain('calendar.importButton')
    })
  })

  // ---- Error state ----

  it('shows error state when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server Error' }),
    }) as unknown as typeof fetch

    render(<CalendarSyncPage />)
    await waitFor(() => {
      expect(screen.getByText('calendar.errorTitle')).toBeInTheDocument()
    })
    expect(screen.getByText('calendar.retry')).toBeInTheDocument()
    expect(screen.getByText('common.goBack')).toBeInTheDocument()
  })

  it('shows recurring badge for recurring events', async () => {
    const events = [
      { id: 'e1', title: 'Daily Standup', description: null, startDate: '2025-06-01', startTime: '09:00', endTime: null, isRecurring: true, recurrenceRule: 'RRULE:FREQ=DAILY', reminders: [] },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(events),
    }) as unknown as typeof fetch

    render(<CalendarSyncPage />)
    await waitFor(() => {
      expect(screen.getByText('Daily Standup')).toBeInTheDocument()
    })
    expect(screen.getByText('calendar.recurrenceDaily')).toBeInTheDocument()
  })

  it('renders with null profile without crashing', () => {
    mockProfile = null
    mockHasProAccess = true
    const { container } = render(<CalendarSyncPage />)
    expect(container).toBeTruthy()
  })
})
