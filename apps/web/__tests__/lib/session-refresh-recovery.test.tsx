import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { ExpiryWarning } from '@/components/ui/expiry-warning'
import { sessionAwareFetch } from '@/lib/api-fetch'
import { runServerAction } from '@/lib/client-action'
import { useAuthStore } from '@/stores/auth-store'

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('session refresh recovery', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        userId: 'user-1',
        name: 'Thomas',
        email: 'thomas@example.com',
      },
      expiresAt: Date.now() + 60_000,
      sessionRefreshFailed: false,
    })
  })

  it('ignores a late losing refresh response after rotated cookies win', async () => {
    const expiresAt = Date.now() + 3_600_000
    mockFetch
      .mockResolvedValueOnce(new Response(null, {
        status: 401,
        headers: { 'x-orbit-session-refresh': 'failed' },
      }))
      .mockResolvedValueOnce(Response.json({ expiresAt, refreshFailed: false }))

    render(<ExpiryWarning />)
    await act(() => sessionAwareFetch('/api/profile'))

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      user: expect.objectContaining({ userId: 'user-1' }),
      expiresAt,
      sessionRefreshFailed: false,
    })
    expect(mockFetch).toHaveBeenNthCalledWith(2, '/api/auth/session')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('recovers when the winning refresh response arrives after loser revalidation', async () => {
    const expiresAt = Date.now() + 3_600_000
    let resolveWinner: ((response: Response) => void) | undefined
    mockFetch
      .mockImplementationOnce(() => new Promise<Response>((resolve) => {
        resolveWinner = resolve
      }))
      .mockResolvedValueOnce(new Response(null, {
        status: 401,
        headers: { 'x-orbit-session-refresh': 'failed' },
      }))
      .mockResolvedValueOnce(Response.json(
        { expiresAt: null, refreshFailed: true },
        { status: 401 },
      ))
      .mockResolvedValueOnce(Response.json({ expiresAt, refreshFailed: false }))

    const winner = sessionAwareFetch('/api/winner')
    await act(() => sessionAwareFetch('/api/loser'))

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      sessionRefreshFailed: true,
    })

    resolveWinner?.(Response.json({ ok: true }))
    await act(() => winner)

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      user: expect.objectContaining({ userId: 'user-1' }),
      expiresAt,
      sessionRefreshFailed: false,
    })
    expect(mockFetch).toHaveBeenNthCalledWith(4, '/api/auth/session')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('recovers when a delayed successful Server Action follows a rejected loser', async () => {
    const expiresAt = Date.now() + 3_600_000
    let resolveWinner: ((result: { ok: true; data: { habitId: string } }) => void) | undefined
    const winnerResult = new Promise<{ ok: true; data: { habitId: string } }>((resolve) => {
      resolveWinner = resolve
    })
    const winner = runServerAction(winnerResult)
    mockFetch
      .mockResolvedValueOnce(Response.json(
        { expiresAt: null, refreshFailed: true },
        { status: 401 },
      ))
      .mockResolvedValueOnce(Response.json({ expiresAt, refreshFailed: false }))

    await expect(runServerAction(Promise.resolve({
      ok: false as const,
      error: 'Unauthorized',
      status: 401,
      sessionRefreshFailed: true,
    }))).rejects.toThrow('Unauthorized')

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      sessionRefreshFailed: true,
    })

    resolveWinner?.({ ok: true, data: { habitId: 'habit-1' } })
    await expect(winner).resolves.toEqual({ habitId: 'habit-1' })

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      user: expect.objectContaining({ userId: 'user-1' }),
      expiresAt,
      sessionRefreshFailed: false,
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
