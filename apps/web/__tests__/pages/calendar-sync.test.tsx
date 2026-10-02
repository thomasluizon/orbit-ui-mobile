import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import type { CalendarSyncEvent } from '@orbit/shared'
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { calendarKeys } from '@orbit/shared/query'
import { useRef, useState } from 'react'
const toastError = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())


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
const mockGoogleAssign = vi.fn()

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
  isError: boolean
  refetch: ReturnType<typeof vi.fn>
} = {
  data: {
    enabled: false,
    status: 'Idle',
    lastSyncedAt: null,
    hasGoogleConnection: true,
  },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
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
    mutateAsync: mockDismissSuggestion,
    isPending: false,
  }),
}))

vi.mock('@/hooks/use-calendars', () => ({
  useCalendars: () => ({ data: [], isLoading: false, isError: false }),
  useSetSelectedCalendars: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('@/hooks/use-calendar-events', async () => {
  const { useEffect, useState } = await import('react')
  const { isCalendarSyncNotConnectedMessage } = await import('@orbit/shared/utils')

  type State = {
    data:
      | { status: 'connected'; events: unknown[] }
      | { status: 'not-connected' }
      | undefined
    isLoading: boolean
    isError: boolean
    error: Error | null
  }

  return {
    useCalendarEvents: (options?: { enabled?: boolean }) => {
      const enabled = options?.enabled !== false
      const [state, setState] = useState<State>({
        data: undefined,
        isLoading: enabled,
        isError: false,
        error: null,
      })
      useEffect(() => {
        if (!enabled) return
        const cancelled = { current: false }
        void (async () => {
          try {
            const res = await globalThis.fetch('/api/calendar/events')
            if (cancelled.current) return
            if (!res.ok) {
              const body = (await res.json().catch(() => null)) as
                | { error?: string; message?: string }
                | null
              const msg =
                body?.error ?? body?.message ?? `Failed with status ${res.status}`
              if (isCalendarSyncNotConnectedMessage(msg.toLowerCase())) {
                setState({
                  data: { status: 'not-connected' },
                  isLoading: false,
                  isError: false,
                  error: null,
                })
                return
              }
              setState({
                data: undefined,
                isLoading: false,
                isError: true,
                error: new Error(msg),
              })
              return
            }
            const events = (await res.json()) as unknown[]
            setState({
              data: { status: 'connected', events },
              isLoading: false,
              isError: false,
              error: null,
            })
          } catch (err) {
            if (cancelled.current) return
            setState({
              data: undefined,
              isLoading: false,
              isError: true,
              error: err as Error,
            })
          }
        })()
        return () => {
          cancelled.current = true
        }
      }, [enabled])
      return { ...state, refetch: vi.fn() }
    },
  }
})

vi.mock('@orbit/shared/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/utils')>()
  return {
    ...actual,
    getErrorMessage: (err: unknown, fallback: string) => fallback,
  }
})

vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: toastError, showSuccess: toastSuccess }) }))

let mockFetchResponse: { ok: boolean; status: number; json: () => Promise<unknown> } | null = null

const originalFetch = globalThis.fetch


import { CalendarImportContent, type CalendarImportActionHandle, type CalendarImportActionState } from '@/components/calendar-sync/calendar-import-content'
import { useTranslations } from 'next-intl'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'

function CalendarSyncScreen() {
  const [action, setAction] = useState<CalendarImportActionState | null>(null)
  const actionRef = useRef<CalendarImportActionHandle>(null)
  const t = useTranslations()
  return <>
    <div data-testid="sheet-body">
      <CalendarImportContent reviewMode={mockSearchParams.get('mode') === 'review'} initialEventId={null} onClose={() => {}} onGoToHabits={() => {}} actionRef={actionRef} onActionStateChange={setAction} />
    </div>
    {action ? <div data-testid="sheet-actions"><button disabled={action.disabled} onClick={() => actionRef.current?.importSelected()}>{t('calendar.importButton', { count: action.count })}</button></div> : null}
  </>
}

function renderPage() {
  const queryClient = new QueryClient()
  const view = render(
    <QueryClientProvider client={queryClient}>
      <CalendarSyncScreen />
    </QueryClientProvider>,
  )
  return { ...view, queryClient }
}

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(globalThis.navigator, 'onLine', {
    value,
    configurable: true,
  })
}

describe('CalendarSyncPage', () => {
  beforeEach(() => {
    mockProfile = { id: 'u1', hasProAccess: true }
    mockHasProAccess = true
    mockPush.mockClear()
    mockReplace.mockClear()
    mockBulkMutate.mockReset()
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
      isError: false,
      refetch: vi.fn(),
    }
    mockSuggestions = { data: [], isLoading: false }
    mockSetAutoSync.mockClear()
    mockRunSyncNow.mockClear()
    mockDismissSuggestion.mockClear()
    mockGoogleAssign.mockClear()
    vi.mocked(toastError).mockClear()
    setNavigatorOnline(true)

    globalThis.fetch = vi.fn().mockImplementation(() => {
      if (mockFetchResponse) return Promise.resolve(mockFetchResponse)
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


  describe('complete event text before import', () => {
    const longEvent: CalendarSyncEvent = {
      id: 'long-event',
      title: `Planning the weekly training schedule and reviewing every commitment ${'UnbrokenTitle'.repeat(20)}`,
      calendarName: `The shared calendar for family routines and work commitments ${'UnbrokenCalendar'.repeat(20)}`,
      description: `Review the complete agenda before deciding whether to import this event. ${'Include every preparation step and follow-up commitment. '.repeat(30)}${'UnbrokenDescription'.repeat(20)}`,
      startDate: '2026-07-01', startTime: '09:00', endTime: '10:00',
      isRecurring: false, recurrenceRule: null, reminders: [],
    }
    let browserLaunch: BrowserLaunch | undefined
    let browser: Browser
    let stylesheet: string

    registerChromeLaunchHook(beforeAll, async (launch) => {
      browserLaunch = launch
      browser = await launch
    })
    beforeAll(async () => {
      const source = resolve(process.cwd(), 'app/globals.css')
      stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    })
    afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

    function provideEvents(review: boolean, blocked: boolean) {
      const event = blocked ? { ...longEvent, isRecurring: true, recurrenceRule: 'RRULE:FREQ=MONTHLY;COUNT=3', startDate: '2026-01-31', startTime: null } : longEvent
      const events = [event, { ...longEvent, id: 'short-event', title: 'Short event', calendarName: null, description: null }]
      if (review) {
        mockSearchParams.set('mode', 'review')
        mockSuggestions = { data: events.map((entry) => ({ id: `suggestion-${entry.id}`, event: entry })), isLoading: false }
      } else {
        mockFetchResponse = { ok: true, status: 200, json: () => Promise.resolve(events) }
      }
    }

    it.each([
      [320, false, false], [412, true, false], [320, true, true], [1440, false, false],
    ])('wraps all full values at %ipx, review: %s, blocked: %s', async (width, review, blocked) => {
      provideEvents(review, blocked)
      const { container } = renderPage()
      await screen.findByText(longEvent.title)
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      try {
        await page.setContent(`<style>${stylesheet}</style><div style="width: min(100%, 480px)">${container.innerHTML}</div>`)
        await loadAppFonts(page)
        for (const value of [longEvent.title, longEvent.calendarName!, longEvent.description!]) {
          const field = page.getByText(value, { exact: true })
          const geometry = await field.evaluate((element) => {
            const bounds = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            const range = document.createRange()
            range.selectNodeContents(element)
            return {
              height: bounds.height,
              lineHeight: Number.parseFloat(style.lineHeight),
              textInside: [...range.getClientRects()].every((rect) => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1),
              horizontalOverflow: element.scrollWidth > element.clientWidth + 1,
            }
          })
          expect(geometry.height, value).toBeGreaterThan(geometry.lineHeight)
          expect(geometry.textInside, value).toBe(true)
          expect(geometry.horizontalOverflow, value).toBe(false)
        }
      } finally { await page.close() }
      const row = screen.getByRole('button', { name: new RegExp('Planning the weekly training') })
      expect(row).toHaveAttribute('aria-pressed', blocked ? 'false' : 'true')
      if (blocked) {
        expect(row).toBeDisabled()
        expect(row).toHaveAccessibleDescription('calendar.importIssue.finiteDateClamp')
      } else {
        row.focus()
        expect(row).toHaveFocus()
        const user = userEvent.setup()
        await user.keyboard(' ')
        expect(row).toHaveAttribute('aria-pressed', 'false')
        await user.keyboard('{Enter}')
        expect(row).toHaveAttribute('aria-pressed', 'true')
      }
      if (review) {
        fireEvent.click(screen.getAllByRole('button', { name: 'calendar.autoSync.dismissSuggestion' })[0]!)
        expect(mockDismissSuggestion).toHaveBeenCalledWith({ id: 'suggestion-long-event' })
        expect(row).toHaveAttribute('aria-pressed', blocked ? 'false' : 'true')
      }
      expect(mockBulkMutate).not.toHaveBeenCalled()
    })
  })

  it('renders without crashing', () => {
    const { container } = renderPage()
    expect(container).toBeTruthy()
  })

  it('redirects non-Pro users to upgrade', async () => {
    mockHasProAccess = false
    mockProfile = { id: 'u1', hasProAccess: false }
    renderPage()
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/upgrade')
    })
  })


  it('shows loading state initially for Pro users', () => {
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {})) as unknown as typeof fetch
    renderPage()
    expect(screen.getByRole('progressbar', { name: 'calendar.fetchingEvents' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })


  it('shows not-connected state when API returns not connected error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Not connected' }),
    }) as unknown as typeof fetch

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('calendar.notConnectedTitle')).toBeInTheDocument()
    })
    expect(screen.getByText('calendar.notConnectedDesc')).toBeInTheDocument()
    expect(screen.getByText('auth.signInWithGoogle')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button')[0]).toHaveTextContent('auth.signInWithGoogle')
    const linkGlyph = screen.getByRole('status').querySelector('svg.tabler-icon-link')
    expect(linkGlyph?.getAttribute('class')).toContain('text-[var(--fg-1)]')
    expect(linkGlyph?.parentElement).toHaveStyle({ background: 'var(--bg-well)' })
  })

  it('shows the connection action in a disconnected review sheet', () => {
    mockSearchParams.set('mode', 'review')
    mockAutoSyncState.data = {
      enabled: false, status: 'ReconnectRequired', lastSyncedAt: null, hasGoogleConnection: false,
    }

    renderPage()

    expect(screen.getByText('calendar.notConnectedTitle')).toBeInTheDocument()
    expect(screen.getByText('auth.signInWithGoogle')).toBeInTheDocument()
  })

  it('shows retry when connection status fails instead of claiming disconnection', () => {
    mockAutoSyncState.data = undefined
    mockAutoSyncState.isError = true
    renderPage()

    expect(screen.getByText('calendar.errorTitle')).toBeInTheDocument()
    expect(screen.queryByText('calendar.notConnectedTitle')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('calendar.retry'))
    expect(mockAutoSyncState.refetch).toHaveBeenCalled()
  })

  it('requests renewed Google calendar consent from the not-connected state', async () => {
    vi.stubGlobal('location', { assign: mockGoogleAssign })
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Google Calendar connection expired. Please reconnect.' }),
    }) as unknown as typeof fetch

    renderPage()

    const connectButton = await screen.findByText('auth.signInWithGoogle')
    fireEvent.click(connectButton)

    expect(mockGoogleAssign).toHaveBeenCalledWith('/api/auth/google/start?purpose=calendar')
    expect(sessionStorage.getItem('auth_return_url')).toBe('/calendar?import=1')
    vi.unstubAllGlobals()
  })


  it('shows no events message when calendar has no events', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    }) as unknown as typeof fetch

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('calendar.noEvents')).toBeInTheDocument()
    })
    expect(screen.getByText('common.goBack')).toBeInTheDocument()
  })


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

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Morning Workout')).toBeInTheDocument()
    })
    expect(screen.getByText('Team Meeting')).toBeInTheDocument()
    expect(document.body.textContent).toContain('calendar.eventsFound')
    expect(screen.getAllByRole('button').some((button) => button.getAttribute('aria-pressed') === 'true')).toBe(true)
  })

  it('explains and disables an ordinal weekday suggestion before import', async () => {
    mockSearchParams.set('mode', 'review')
    mockSuggestions = {
      data: [
        {
          id: 'suggestion-second-monday',
          event: {
            id: 'event-second-monday',
            title: 'Second Monday review',
            description: null,
            startDate: '2026-09-14',
            startTime: null,
            endTime: null,
            isRecurring: true,
            recurrenceRule: 'RRULE:FREQ=MONTHLY;BYDAY=2MO',
            reminders: [],
          },
        },
      ],
      isLoading: false,
    }

    renderPage()

    const issue = await screen.findByText('calendar.importIssue.ordinalWeekday')
    expect(screen.getByText('Second Monday review').closest('button')).toBeDisabled()
    expect(issue).toBeVisible()
    expect(screen.getByLabelText('calendar.selectAll')).toBeDisabled()
    expect((await screen.findByText(/calendar.importButton/)).closest('button')).toBeDisabled()

    const row = screen.getByText('Second Monday review').closest('button')?.parentElement
    expect(row?.className).not.toContain('hover:bg-[var(--bg-elev)]')
    expect(row).toHaveStyle({ background: 'var(--bg-elev)' })
  })

  it('enables and imports an alternating weekday suggestion', async () => {
    mockSearchParams.set('mode', 'review')
    mockSuggestions = {
      data: [{
        id: 'suggestion-alternate-weeks',
        event: {
          id: 'event-alternate-weeks',
          title: 'Alternate week training',
          description: null,
          startDate: '2026-09-21',
          startTime: null,
          endTime: null,
          isRecurring: true,
          recurrenceRule: 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE',
          reminders: [],
        },
      }],
      isLoading: false,
    }

    renderPage()

    expect((await screen.findByText('Alternate week training')).closest('button')).not.toBeDisabled()
    const importButton = (await screen.findByText(/calendar.importButton/)).closest('button')
    expect(importButton).not.toBeDisabled()
    fireEvent.click(importButton!)
    expect(mockBulkMutate).toHaveBeenCalledWith(expect.objectContaining({
      habits: [expect.objectContaining({
        days: ['Monday', 'Wednesday'],
        frequencyUnit: 'Day',
        frequencyQuantity: 1,
        intervalWeeks: 2,
      })],
    }), expect.anything())
  })

  it.each([
    ['a monthly weekday interval', 'RRULE:FREQ=MONTHLY;INTERVAL=2;BYDAY=MO', '2026-09-21', 1],
    ['a weekday interval above the API bound', 'RRULE:FREQ=WEEKLY;INTERVAL=53;BYDAY=MO', '2026-09-21', 1],
    ['a different active-week partition', 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO;WKST=MO', '2026-09-27', 0],
  ])('disables %s in review', async (_name, recurrenceRule, startDate, weekStartDay) => {
    mockProfile = { id: 'u1', hasProAccess: true, weekStartDay }
    mockSearchParams.set('mode', 'review')
    mockSuggestions = { data: [{
      id: 'suggestion-unsupported',
      event: { id: 'event-unsupported', title: 'Unsupported training', description: null,
        startDate, startTime: null, endTime: null, isRecurring: true, recurrenceRule, reminders: [] },
    }], isLoading: false }

    renderPage()

    expect((await screen.findByText('Unsupported training')).closest('button')).toBeDisabled()
    expect(screen.getByText('calendar.importIssue.unsupportedWeekdayRecurrence')).toBeVisible()
    expect(screen.getByLabelText('calendar.selectAll')).toBeDisabled()
    expect((await screen.findByText(/calendar.importButton/)).closest('button')).toBeDisabled()
  })

  it('explains and disables a finite month-end suggestion before import', async () => {
    mockSearchParams.set('mode', 'review')
    mockSuggestions = {
      data: [
        {
          id: 'suggestion-month-end',
          event: {
            id: 'event-month-end',
            title: 'Month end close',
            description: null,
            startDate: '2026-01-31',
            startTime: null,
            endTime: null,
            isRecurring: true,
            recurrenceRule: 'RRULE:FREQ=MONTHLY;COUNT=3',
            reminders: [],
          },
        },
      ],
      isLoading: false,
    }

    renderPage()

    expect(await screen.findByText('calendar.importIssue.finiteDateClamp')).toBeVisible()
    expect(screen.getByText('Month end close').closest('button')).toBeDisabled()
  })

  it('keeps the actionable hover treatment on a row that can still be imported', async () => {
    mockSearchParams.set('mode', 'review')
    mockSuggestions = {
      data: [
        {
          id: 'suggestion-weekly',
          event: {
            id: 'event-weekly',
            title: 'Weekly review',
            description: null,
            startDate: '2026-09-14',
            startTime: null,
            endTime: null,
            isRecurring: true,
            recurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
            reminders: [],
          },
        },
      ],
      isLoading: false,
    }

    renderPage()

    const button = await screen.findByText('Weekly review')
    const hitArea = button.closest('button')
    expect(hitArea).not.toBeDisabled()
    expect(hitArea?.className).toContain('enabled:hover:bg-[var(--bg-hover)]')
    expect(hitArea?.className).toContain('rounded-[12px]')
    expect(hitArea?.parentElement?.className).not.toContain('hover:bg-')
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

    renderPage()
    await waitFor(() => {
      expect(screen.getByLabelText('calendar.deselectAll')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('calendar.deselectAll')).toHaveAttribute('aria-pressed', 'true')
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

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Event 1')).toBeInTheDocument()
    })

    expect(screen.getByLabelText('calendar.deselectAll')).toBeInTheDocument()
    expect(await screen.findByText(/calendar.importButton/)).toBeInTheDocument()
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

    renderPage()
    await waitFor(() => {
      expect(document.body.textContent).toContain('calendar.importButton')
    })
  })


  it('shows error state when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server Error' }),
    }) as unknown as typeof fetch

    renderPage()
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

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Daily Standup')).toBeInTheDocument()
    })
    expect(screen.getByText('calendar.recurrenceDaily')).toBeInTheDocument()
  })

  it('renders with null profile without crashing', () => {
    mockProfile = null
    mockHasProAccess = true
    const { container } = renderPage()
    expect(container).toBeTruthy()
  })

  it('shows the offline state instead of the wizard when the browser is offline', () => {
    setNavigatorOnline(false)
    renderPage()
    expect(screen.getByText('offline.calendar.title')).toBeInTheDocument()
    expect(screen.getByText('offline.calendar.reason')).toBeInTheDocument()
    expect(screen.queryByText('calendar.fetchingEvents')).not.toBeInTheDocument()
  })

  it('keeps loaded events visible and refuses import after disconnect', async () => {
    const events = [
      { id: 'e1', title: 'Morning Workout', description: null, startDate: '2025-06-01', startTime: '08:00', endTime: '09:00', isRecurring: false, recurrenceRule: null, reminders: [], calendarName: null },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(events),
    }) as unknown as typeof fetch

    renderPage()
    await screen.findByText('Morning Workout')
    const offlineStatus = screen.getByRole('status')
    setNavigatorOnline(false)
    act(() => { globalThis.dispatchEvent(new Event('offline')) })

    expect(screen.getByText('Morning Workout')).toBeVisible()
    const refusals = screen.getAllByText('offline.calendar.reason')
    expect(refusals).toHaveLength(1)
    expect(offlineStatus).toHaveTextContent('offline.calendar.reason')
    const importButton = (await screen.findByText('calendar.importButton:{"count":1}')).closest('button')!
    expect(screen.getByTestId('sheet-body')).toContainElement(refusals[0]!)
    expect(screen.getByTestId('sheet-actions')).toContainElement(importButton)
    expect(screen.getByTestId('sheet-body')).not.toContainElement(importButton)
    expect(importButton).toBeDisabled()
    expect(mockBulkMutate).not.toHaveBeenCalled()
  })

  it('keeps loaded review suggestions visible and refuses writes after disconnect', async () => {
    mockSearchParams.set('mode', 'review')
    mockSuggestions = {
      data: [{
        id: 'suggestion-1',
        event: { id: 'e1', title: 'Team meeting', description: null, startDate: '2025-06-01', startTime: '09:00', endTime: '10:00', isRecurring: false, recurrenceRule: null, reminders: [], calendarName: null },
      }],
      isLoading: false,
    }

    renderPage()
    await screen.findByText('Team meeting')
    setNavigatorOnline(false)
    act(() => { globalThis.dispatchEvent(new Event('offline')) })

    expect(screen.getByText('Team meeting')).toBeVisible()
    expect((await screen.findByText(/calendar.importButton/)).closest('button')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'calendar.autoSync.dismissSuggestion' })).toBeDisabled()
    expect(mockBulkMutate).not.toHaveBeenCalled()
    expect(mockDismissSuggestion).not.toHaveBeenCalled()
  })

  it('lists imported habits on the done step and toasts partial failures', async () => {
    const events = [
      { id: 'e1', title: 'Morning Workout', description: null, startDate: '2025-06-01', startTime: '08:00', endTime: '09:00', isRecurring: false, recurrenceRule: null, reminders: [], calendarName: null },
      { id: 'e2', title: 'Team Meeting', description: null, startDate: '2025-06-01', startTime: '10:00', endTime: '11:00', isRecurring: false, recurrenceRule: null, reminders: [], calendarName: null },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(events),
    }) as unknown as typeof fetch
    mockBulkMutate.mockImplementation(
      (
        _variables: unknown,
        options: {
          onSuccess: (result: {
            results: { status: string; habitId: string | null; title: string | null; error: string | null }[]
          }) => void
        },
      ) => {
        options.onSuccess({
          results: [
            { status: 'Success', habitId: 'h1', title: 'Morning Workout', error: null },
            { status: 'Failed', habitId: null, title: 'Team Meeting', error: 'boom' },
          ],
        })
      },
    )

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Morning Workout')).toBeInTheDocument()
    })

    fireEvent.click(await screen.findByText(/calendar\.importButton/))

    await waitFor(() => {
      expect(screen.getByText('calendar.importDone')).toBeInTheDocument()
    })
    expect(screen.getByText('Morning Workout')).toBeInTheDocument()
    expect(screen.queryByText('Team Meeting')).not.toBeInTheDocument()
    expect(toastError).toHaveBeenCalledWith('calendar.importPartialFailure:{"count":1}')
  })

  it('drops the import result when another account replaces the tab', async () => {
    const events = [
      { id: 'e1', title: 'Morning Workout', description: null, startDate: '2025-06-01', startTime: '08:00', endTime: '09:00', isRecurring: false, recurrenceRule: null, reminders: [], calendarName: null },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(events),
    }) as unknown as typeof fetch
    holdAccount('user-1')
    mockBulkMutate.mockImplementation(
      (
        _variables: unknown,
        options: {
          onSuccess: (result: {
            results: { status: string; habitId: string | null; title: string | null; error: string | null }[]
          }) => void
        },
      ) => {
        options.onSuccess({
          results: [{ status: 'Success', habitId: 'h1', title: 'Morning Workout', error: null }],
        })
      },
    )

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Morning Workout')).toBeInTheDocument()
    })
    fireEvent.click(await screen.findByText(/calendar\.importButton/))
    await waitFor(() => {
      expect(screen.getByText('calendar.importDone')).toBeInTheDocument()
    })

    await replaceAccountWith('user-2')

    expect(screen.queryByText('calendar.importDone')).not.toBeInTheDocument()
  })

  it('ignores an old import callback after account replacement', async () => {
    const events = [
      { id: 'e1', title: 'Morning Workout', description: null, startDate: '2025-06-01', startTime: '08:00', endTime: '09:00', isRecurring: false, recurrenceRule: null, reminders: [], calendarName: null },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve(events),
    }) as unknown as typeof fetch
    holdAccount('user-1')
    let finishImport!: (result: { results: { status: string; habitId: string | null; title: string | null; error: string | null }[] }) => void
    mockBulkMutate.mockImplementation((_variables: unknown, options: { onSuccess: typeof finishImport }) => {
      finishImport = options.onSuccess
    })
    renderPage()
    fireEvent.click(await screen.findByText(/calendar\.importButton/))

    await replaceAccountWith('user-2')
    finishImport({ results: [
      { status: 'Success', habitId: 'h1', title: 'Morning Workout', error: null },
      { status: 'Failed', habitId: null, title: 'Account A event', error: 'failed' },
    ] })

    expect(toastError).not.toHaveBeenCalled()
    expect(screen.queryByText('calendar.importDone')).not.toBeInTheDocument()
  })

  it('does not show a previous account suggestion error after replacement', async () => {
    mockSearchParams.set('mode', 'review')
    mockSuggestions = {
      data: [{
        id: 'sug-1',
        event: { id: 'e1', title: 'Morning Workout', description: null, startDate: '2025-06-01', startTime: '08:00', endTime: '09:00', isRecurring: false, recurrenceRule: null, reminders: [], calendarName: null },
      }],
      isLoading: false,
    }
    holdAccount('user-1')
    let failDismiss!: (error: Error) => void
    mockDismissSuggestion.mockImplementationOnce(() => new Promise((_resolve, reject) => { failDismiss = reject }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'calendar.autoSync.dismissSuggestion' }))
    await waitFor(() => expect(mockDismissSuggestion).toHaveBeenCalledWith({ id: 'sug-1' }))
    await replaceAccountWith('user-2')
    await act(async () => { failDismiss(new Error('old failure')); await Promise.resolve() })
    expect(toastError).not.toHaveBeenCalled()
  })

  it('invalidates sync suggestions after a review-mode import', async () => {
    mockSearchParams.set('mode', 'review')
    mockSuggestions = {
      data: [
        {
          id: 'sug-1',
          event: { id: 'e1', title: 'Morning Workout', description: null, startDate: '2025-06-01', startTime: '08:00', endTime: '09:00', isRecurring: false, recurrenceRule: null, reminders: [], calendarName: null },
        },
      ],
      isLoading: false,
    }
    mockBulkMutate.mockImplementation(
      (
        _variables: unknown,
        options: {
          onSuccess: (result: {
            results: { status: string; habitId: string | null; title: string | null; error: string | null }[]
          }) => void
        },
      ) => {
        options.onSuccess({
          results: [{ status: 'Success', habitId: 'h1', title: 'Morning Workout', error: null }],
        })
      },
    )

    const { queryClient } = renderPage()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    fireEvent.click(await screen.findByText(/calendar\.importButton/))

    await waitFor(() => {
      expect(screen.getByText('calendar.importDone')).toBeInTheDocument()
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: calendarKeys.syncSuggestions(),
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [...calendarKeys.all, 'manual-fetch'],
    })
  })
})
