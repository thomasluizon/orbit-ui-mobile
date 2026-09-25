import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { act } from '@testing-library/react'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

interface AutoSyncState {
  hasGoogleConnection: boolean
  enabled: boolean
  status: string | null
  lastSyncedAt: string | null
}

const hoisted = vi.hoisted(() => ({
  state: undefined as AutoSyncState | undefined,
  isLoading: false,
  isOnline: true,
  setAutoSync: { mutateAsync: vi.fn(), isPending: false },
  runSyncNow: { mutateAsync: vi.fn(), isPending: false },
  toast: { error: vi.fn(), success: vi.fn() },
  connectGoogle: vi.fn(),
  realHooks: false,
  realRunHook: false,
  setAutoSyncAction: vi.fn(),
  runSyncNowAction: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOnline: hoisted.isOnline }),
}))

vi.mock('@/hooks/use-calendar-auto-sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-calendar-auto-sync')>()
  return {
    useCalendarAutoSyncState: () => ({ data: hoisted.state, isLoading: hoisted.isLoading }),
    useSetCalendarAutoSync: () => hoisted.realHooks ? actual.useSetCalendarAutoSync() : hoisted.setAutoSync,
    useRunCalendarSyncNow: () => hoisted.realRunHook ? actual.useRunCalendarSyncNow() : hoisted.runSyncNow,
  }
})

vi.mock('@/lib/actions/calendar', () => ({
  setCalendarAutoSync: (...args: unknown[]) => hoisted.setAutoSyncAction(...args),
  runCalendarSyncNow: (...args: unknown[]) => hoisted.runSyncNowAction(...args),
}))

vi.mock('@orbit/shared/utils', () => ({
  formatCalendarAutoSyncLastSynced: () => 'last synced just now',
  getFriendlyErrorMessage: () => 'friendly-error',
  isCalendarAutoSyncStatusReconnectRequired: (status?: string | null) =>
    status === 'reconnect_required',
}))

vi.mock('sonner', () => ({ toast: hoisted.toast }))

vi.mock('@/app/(app)/calendar-sync/_components/connect-google', () => ({
  connectGoogle: (...args: unknown[]) => hoisted.connectGoogle(...args),
}))

import { AutoSyncSettingsCard } from '@/app/(app)/calendar-sync/_components/auto-sync-settings-card'

function toggle() {
  return screen.getByLabelText('calendar.autoSync.toggleLabel')
}

describe('AutoSyncSettingsCard', () => {
  beforeEach(() => {
    hoisted.isOnline = true
    hoisted.isLoading = false
    hoisted.state = {
      hasGoogleConnection: true,
      enabled: false,
      status: 'ok',
      lastSyncedAt: '2026-07-01T00:00:00Z',
    }
    hoisted.setAutoSync.mutateAsync.mockReset().mockResolvedValue(undefined)
    hoisted.runSyncNow.mutateAsync.mockReset().mockResolvedValue(undefined)
    hoisted.setAutoSync.isPending = false
    hoisted.runSyncNow.isPending = false
    hoisted.toast.error.mockReset()
    hoisted.toast.success.mockReset()
    hoisted.connectGoogle.mockReset().mockResolvedValue(undefined)
    hoisted.realHooks = false
    hoisted.realRunHook = false
    hoisted.setAutoSyncAction.mockReset()
    hoisted.runSyncNowAction.mockReset()
  })

  it('prompts to connect Google and disables the toggle when unconnected', () => {
    hoisted.state = { hasGoogleConnection: false, enabled: false, status: null, lastSyncedAt: null }
    render(<AutoSyncSettingsCard />)

    expect(screen.getByText('calendar.autoSync.connectGoogleFirst')).toBeInTheDocument()
    expect(toggle()).toBeDisabled()
  })

  it('shows a loading status while state is fetching', () => {
    hoisted.isLoading = true
    render(<AutoSyncSettingsCard />)

    expect(screen.getByText('calendar.fetchingEvents')).toBeInTheDocument()
  })

  it('enables auto-sync and confirms with a success toast', async () => {
    render(<AutoSyncSettingsCard />)

    fireEvent.click(toggle())

    await waitFor(() =>
      expect(hoisted.setAutoSync.mutateAsync).toHaveBeenCalledWith({ enabled: true }),
    )
    expect(hoisted.toast.success).toHaveBeenCalledWith('calendar.autoSync.enableSuccess')
  })

  it('confirms with the disable copy when turning auto-sync off', async () => {
    hoisted.state = { hasGoogleConnection: true, enabled: true, status: 'ok', lastSyncedAt: null }
    render(<AutoSyncSettingsCard />)

    fireEvent.click(toggle())

    await waitFor(() =>
      expect(hoisted.setAutoSync.mutateAsync).toHaveBeenCalledWith({ enabled: false }),
    )
    expect(hoisted.toast.success).toHaveBeenCalledWith('calendar.autoSync.disableSuccess')
  })

  it('surfaces a friendly error when the toggle mutation fails', async () => {
    hoisted.setAutoSync.mutateAsync.mockRejectedValue(new Error('nope'))
    render(<AutoSyncSettingsCard />)

    fireEvent.click(toggle())

    await waitFor(() => expect(hoisted.toast.error).toHaveBeenCalledWith('friendly-error'))
  })

  it.each([true, false])('ignores the previous account toggle %s outcome after the next account toggles', async (succeeds) => {
    hoisted.realHooks = true
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    let finishFirst!: (value?: unknown) => void
    let failFirst!: (error: Error) => void
    hoisted.setAutoSyncAction
      .mockImplementationOnce(() => new Promise((resolve, reject) => { finishFirst = resolve; failFirst = reject }))
      .mockResolvedValueOnce(undefined)
    render(<QueryClientProvider client={queryClient}><AutoSyncSettingsCard /></QueryClientProvider>)
    fireEvent.click(toggle())
    await waitFor(() => expect(hoisted.setAutoSyncAction).toHaveBeenCalledTimes(1))
    expect(toggle()).toBeDisabled()

    act(() => advanceAccountGeneration())
    await waitFor(() => expect(toggle()).not.toBeDisabled())
    fireEvent.click(toggle())
    await waitFor(() => expect(hoisted.setAutoSyncAction).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(hoisted.toast.success).toHaveBeenCalledTimes(1))

    await act(async () => {
      if (succeeds) finishFirst(undefined)
      else failFirst(new Error('old failure'))
    })
    expect(hoisted.toast.success).toHaveBeenCalledTimes(1)
    expect(hoisted.toast.error).not.toHaveBeenCalled()
  })

  it('does not confirm a toggle interrupted before its request was sent', async () => {
    hoisted.realHooks = true
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    let finishCancellation!: () => void
    vi.spyOn(queryClient, 'cancelQueries').mockReturnValueOnce(new Promise<void>((resolve) => { finishCancellation = resolve }))
    render(<QueryClientProvider client={queryClient}><AutoSyncSettingsCard /></QueryClientProvider>)
    fireEvent.click(toggle())
    await waitFor(() => expect(queryClient.cancelQueries).toHaveBeenCalledTimes(1))
    act(() => advanceAccountGeneration())
    await act(async () => { finishCancellation(); await Promise.resolve() })
    expect(hoisted.setAutoSyncAction).not.toHaveBeenCalled()
    expect(hoisted.toast.success).not.toHaveBeenCalled()
    expect(hoisted.toast.error).not.toHaveBeenCalled()
    expect(toggle()).not.toBeDisabled()
  })

  it('blocks a manual sync while offline', () => {
    hoisted.isOnline = false
    render(<AutoSyncSettingsCard />)

    fireEvent.click(screen.getByRole('button', { name: /calendar\.autoSync\.syncNow/ }))

    expect(hoisted.toast.error).toHaveBeenCalledWith('errors.offline')
    expect(hoisted.runSyncNow.mutateAsync).not.toHaveBeenCalled()
  })

  it('runs a manual sync when Sync now is pressed', async () => {
    render(<AutoSyncSettingsCard />)

    fireEvent.click(screen.getByRole('button', { name: /calendar\.autoSync\.syncNow/ }))

    await waitFor(() => expect(hoisted.runSyncNow.mutateAsync).toHaveBeenCalledTimes(1))
  })

  it('reports a friendly error when the manual sync fails', async () => {
    hoisted.runSyncNow.mutateAsync.mockRejectedValue(new Error('down'))
    render(<AutoSyncSettingsCard />)

    fireEvent.click(screen.getByRole('button', { name: /calendar\.autoSync\.syncNow/ }))

    await waitFor(() => expect(hoisted.toast.error).toHaveBeenCalledWith('friendly-error'))
  })

  it('releases Sync now and hides the previous account error after replacement', async () => {
    hoisted.realRunHook = true
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    let failFirst!: (error: Error) => void
    hoisted.runSyncNowAction.mockImplementationOnce(() => new Promise((_resolve, reject) => { failFirst = reject }))
    render(<QueryClientProvider client={queryClient}><AutoSyncSettingsCard /></QueryClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'calendar.autoSync.syncNow' }))
    await waitFor(() => expect(hoisted.runSyncNowAction).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'calendar.autoSync.syncNowRunning' })).toBeDisabled()

    act(() => advanceAccountGeneration())
    await waitFor(() => expect(screen.getByRole('button', { name: 'calendar.autoSync.syncNow' })).not.toBeDisabled())
    await act(async () => { failFirst(new Error('old failure')); await Promise.resolve() })
    expect(hoisted.toast.error).not.toHaveBeenCalled()
  })

  it('offers reconnect when the status requires it and launches the Google flow', async () => {
    hoisted.state = { hasGoogleConnection: true, enabled: true, status: 'reconnect_required', lastSyncedAt: null }
    render(<AutoSyncSettingsCard />)

    expect(screen.getByText('calendar.autoSync.reconnectTitle')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'calendar.autoSync.reconnectCta' }))

    await waitFor(() => expect(hoisted.connectGoogle).toHaveBeenCalledTimes(1))
  })

  it('shows a Google error toast when reconnect fails', async () => {
    hoisted.state = { hasGoogleConnection: true, enabled: true, status: 'reconnect_required', lastSyncedAt: null }
    hoisted.connectGoogle.mockRejectedValue(new Error('oauth'))
    render(<AutoSyncSettingsCard />)

    fireEvent.click(screen.getByRole('button', { name: 'calendar.autoSync.reconnectCta' }))

    await waitFor(() => expect(hoisted.toast.error).toHaveBeenCalledWith('auth.googleError'))
  })
})
