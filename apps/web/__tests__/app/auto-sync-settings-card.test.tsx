import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

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
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOnline: hoisted.isOnline }),
}))

vi.mock('@/hooks/use-calendar-auto-sync', () => ({
  useCalendarAutoSyncState: () => ({ data: hoisted.state, isLoading: hoisted.isLoading }),
  useSetCalendarAutoSync: () => hoisted.setAutoSync,
  useRunCalendarSyncNow: () => hoisted.runSyncNow,
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

import { AutoSyncSection } from '@/app/(app)/calendar-sync/_components/auto-sync-settings-card'

function toggle() {
  return screen.getByLabelText('calendar.autoSync.toggleLabel')
}

describe('AutoSyncSection', () => {
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
  })

  it('prompts to connect Google and disables the toggle when unconnected', () => {
    hoisted.state = { hasGoogleConnection: false, enabled: false, status: null, lastSyncedAt: null }
    render(<AutoSyncSection />)

    expect(screen.getByText('calendar.autoSync.connectGoogleFirst')).toBeInTheDocument()
    expect(toggle()).toBeDisabled()
  })

  it('shows a loading status while state is fetching', () => {
    hoisted.isLoading = true
    render(<AutoSyncSection />)

    expect(screen.getByText('calendar.fetchingEvents')).toBeInTheDocument()
  })

  it('enables auto-sync and confirms with a success toast', async () => {
    render(<AutoSyncSection />)

    fireEvent.click(toggle())

    await waitFor(() =>
      expect(hoisted.setAutoSync.mutateAsync).toHaveBeenCalledWith({ enabled: true }),
    )
    expect(hoisted.toast.success).toHaveBeenCalledWith('calendar.autoSync.enableSuccess')
  })

  it('confirms with the disable copy when turning auto-sync off', async () => {
    hoisted.state = { hasGoogleConnection: true, enabled: true, status: 'ok', lastSyncedAt: null }
    render(<AutoSyncSection />)

    fireEvent.click(toggle())

    await waitFor(() =>
      expect(hoisted.setAutoSync.mutateAsync).toHaveBeenCalledWith({ enabled: false }),
    )
    expect(hoisted.toast.success).toHaveBeenCalledWith('calendar.autoSync.disableSuccess')
  })

  it('surfaces a friendly error when the toggle mutation fails', async () => {
    hoisted.setAutoSync.mutateAsync.mockRejectedValue(new Error('nope'))
    render(<AutoSyncSection />)

    fireEvent.click(toggle())

    await waitFor(() => expect(hoisted.toast.error).toHaveBeenCalledWith('friendly-error'))
  })

  it('blocks a manual sync while offline', () => {
    hoisted.isOnline = false
    render(<AutoSyncSection />)

    fireEvent.click(screen.getByRole('button', { name: /calendar\.autoSync\.syncNow/ }))

    expect(hoisted.toast.error).toHaveBeenCalledWith('errors.offline')
    expect(hoisted.runSyncNow.mutateAsync).not.toHaveBeenCalled()
  })

  it('runs a manual sync when Sync now is pressed', async () => {
    render(<AutoSyncSection />)

    fireEvent.click(screen.getByRole('button', { name: /calendar\.autoSync\.syncNow/ }))

    await waitFor(() => expect(hoisted.runSyncNow.mutateAsync).toHaveBeenCalledTimes(1))
  })

  it('reports a friendly error when the manual sync fails', async () => {
    hoisted.runSyncNow.mutateAsync.mockRejectedValue(new Error('down'))
    render(<AutoSyncSection />)

    fireEvent.click(screen.getByRole('button', { name: /calendar\.autoSync\.syncNow/ }))

    await waitFor(() => expect(hoisted.toast.error).toHaveBeenCalledWith('friendly-error'))
  })

  it('offers reconnect when the status requires it and launches the Google flow', async () => {
    hoisted.state = { hasGoogleConnection: true, enabled: true, status: 'reconnect_required', lastSyncedAt: null }
    render(<AutoSyncSection />)

    expect(screen.getByText('calendar.autoSync.reconnectTitle')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'calendar.autoSync.reconnectCta' }))

    await waitFor(() => expect(hoisted.connectGoogle).toHaveBeenCalledTimes(1))
  })

  it('shows a Google error toast when reconnect fails', async () => {
    hoisted.state = { hasGoogleConnection: true, enabled: true, status: 'reconnect_required', lastSyncedAt: null }
    hoisted.connectGoogle.mockRejectedValue(new Error('oauth'))
    render(<AutoSyncSection />)

    fireEvent.click(screen.getByRole('button', { name: 'calendar.autoSync.reconnectCta' }))

    await waitFor(() => expect(hoisted.toast.error).toHaveBeenCalledWith('auth.googleError'))
  })
})
