import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { gamificationKeys } from '@orbit/shared/query'
import { recapWithCompletions, successfulUnlogResponse } from '@orbit/shared/__tests__/in-place-block-fixtures'
import { useProgressRecap } from '@/hooks/use-recap'
import { useLogHabit } from '@/hooks/use-habits'
import { logHabit } from '@/lib/actions/habits'
import { useAuthStore } from '@/stores/auth-store'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/lib/actions/habits', () => ({ logHabit: vi.fn() }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
afterEach(() => vi.unstubAllGlobals())

it('refreshes mounted recap metrics after an ordinary undo without reward signals', async () => {
  useAuthStore.getState().setAuth({ userId: 'account-a', name: 'Alex', email: 'alex@example.com' })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(gamificationKeys.recap('week'), recapWithCompletions(1))
  const request = vi.fn(() => Promise.resolve(new Response(JSON.stringify(recapWithCompletions(0)))))
  vi.stubGlobal('fetch', request)
  vi.mocked(logHabit).mockResolvedValue(successfulUnlogResponse)
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const view = renderHook(() => ({ recap: useProgressRecap('week'), log: useLogHabit() }), { wrapper })
  try {
    expect(view.result.current.recap.data?.metrics.totalCompletions).toBe(1)
    expect(request).not.toHaveBeenCalled()
    await act(() => view.result.current.log.mutateAsync({ habitId: 'habit-1', intent: 'unlog' }))
    expect(logHabit).toHaveBeenCalledWith('habit-1', undefined, 'account-a')
    await waitFor(() => expect(view.result.current.recap.data?.metrics.totalCompletions).toBe(0))
    expect(request).toHaveBeenCalledWith('/api/gamification/recap?period=week', expect.any(Object))
  } finally {
    view.unmount()
    client.clear()
  }
})
