import { act, create } from 'react-test-renderer'
import type { GeometryTree } from '../support/safe-area-geometry'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { gamificationKeys } from '@orbit/shared/query'
import { recapWithCompletions, successfulUnlogResponse } from '@orbit/shared/__tests__/in-place-block-fixtures'
import { useProgressRecap } from '@/hooks/use-recap'
import { useLogHabit } from '@/hooks/use-habits'
import { apiClient } from '@/lib/api-client'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'

vi.mock('react-i18next', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-i18next')>(),
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }))
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('@/lib/queued-api-mutation', () => ({ performQueuedApiMutation: vi.fn() }))
vi.mock('@/lib/orbit-widget', () => ({ syncWidgetData: vi.fn(() => Promise.resolve()) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))

it('refreshes mounted recap metrics after an ordinary undo without reward signals', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(gamificationKeys.recap('week'), recapWithCompletions(1))
  vi.mocked(apiClient).mockImplementation(<T,>(_url: string, _options?: RequestInit, schema?: z.ZodType<T>) => {
    if (!schema) throw new Error('Expected recap validation')
    return Promise.resolve(schema.parse(recapWithCompletions(0)))
  })
  vi.mocked(performQueuedApiMutation).mockResolvedValue(successfulUnlogResponse)
  let latest!: { recap: ReturnType<typeof useProgressRecap>; log: ReturnType<typeof useLogHabit> }
  function Observer() {
    latest = { recap: useProgressRecap('week'), log: useLogHabit() }
    return null
  }
  let view!: GeometryTree
  await act(() => { view = create(<QueryClientProvider client={client}><Observer /></QueryClientProvider>) as GeometryTree })
  try {
    expect(latest.recap.data?.metrics.totalCompletions).toBe(1)
    expect(apiClient).not.toHaveBeenCalled()
    await act(async () => { await latest.log.mutateAsync({ habitId: 'habit-1', intent: 'unlog' }) })
    expect(performQueuedApiMutation).toHaveBeenCalledWith(expect.objectContaining({ endpoint: '/api/habits/habit-1/log', method: 'POST' }))
    await act(async () => { await vi.waitFor(() => expect(client.getQueryData<ReturnType<typeof recapWithCompletions>>(gamificationKeys.recap('week'))?.metrics.totalCompletions).toBe(0)) })
    expect(latest.recap.data?.metrics.totalCompletions).toBe(0)
    expect(apiClient).toHaveBeenCalledWith('/api/gamification/recap?period=week', undefined, expect.anything())
  } finally {
    await act(() => view.unmount())
    client.clear()
  }
})
