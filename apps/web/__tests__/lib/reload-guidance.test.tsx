import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Toaster, toast } from 'sonner'
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error'
import { UpdateAvailableBanner } from '@/components/ui/update-available-banner'
import { apiFetch, setApiFetchTranslate } from '@/lib/api-fetch'
import { runServerAction } from '@/lib/client-action'
import { useVersionGateStore } from '@/stores/version-gate-store'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: { getState: () => ({ recoverSessionRefreshFailure: async () => {} }) },
}))

describe('reload guidance', () => {
  const reload = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    reload.mockClear()
    vi.stubGlobal('location', { reload })
    useVersionGateStore.setState(useVersionGateStore.getInitialState())
    setApiFetchTranslate((key) => key)
    render(<><UpdateAvailableBanner /><Toaster /></>)
  })

  afterEach(async () => {
    toast.dismiss()
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows one message and one live announcement for a stale Server Action', async () => {
    const settled = vi.fn()
    await act(async () => {
      void runServerAction(Promise.reject(new UnrecognizedActionError('Unknown action')))
        .then(settled, settled)
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(screen.getAllByText('errors.api.appUpdated')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'errors.api.reload' })).toHaveLength(1)
    expect(document.querySelectorAll('[aria-live]:not(:empty)')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('errors.api.appUpdated')
    expect(screen.queryByLabelText('common.dismiss')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'errors.api.reload' }))
    expect(reload).toHaveBeenCalledOnce()
    expect(settled).not.toHaveBeenCalled()
  })

  it('shows one message and one live announcement for repeated 426 responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 426 })))

    await act(async () => {
      await expect(apiFetch('/api/test')).rejects.toMatchObject({ status: 426 })
      await expect(apiFetch('/api/test')).rejects.toMatchObject({ status: 426 })
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(screen.getAllByText('forceUpdate.banner')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'forceUpdate.refresh' })).toHaveLength(1)
    expect(document.querySelectorAll('[aria-live]:not(:empty)')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('forceUpdate.banner')
    fireEvent.click(screen.getByRole('button', { name: 'forceUpdate.refresh' }))
    expect(reload).toHaveBeenCalledOnce()
  })

  it('keeps the banner when a stale action must reject with unavailable fetch translations', async () => {
    setApiFetchTranslate(() => '')
    const error = new UnrecognizedActionError('Unknown action')

    await act(async () => {
      await expect(runServerAction(Promise.reject(error), 'reject')).rejects.toBe(error)
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(screen.getAllByText('errors.api.appUpdated')).toHaveLength(1)
    expect(document.querySelectorAll('[aria-live]:not(:empty)')).toHaveLength(1)
  })
})
