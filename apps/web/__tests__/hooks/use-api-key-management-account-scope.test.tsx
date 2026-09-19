import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { QueryClient } from '@tanstack/react-query'
import { useApiKeyManagement } from '@/hooks/use-api-key-management'
import { clearStepUpState, markStepUpVerified } from '@/lib/step-up-storage'
import {
  holdAccount,
  recoverSameAccount,
  replaceAccountWith,
} from '@/__tests__/support/account-change'

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))

let queryClient: QueryClient

function renderManagement() {
  return renderHook(() =>
    useApiKeyManagement({ hasProAccess: true, queryClient, t: (key: string) => key }),
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clearStepUpState()
  holdAccount('user-1')
  markStepUpVerified('keys')
})

afterEach(() => {
  cleanup()
  clearStepUpState()
  queryClient.clear()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it('disarms the API key creation grant when another account replaces the tab', async () => {
  const { result } = renderManagement()
  expect(result.current.createGrantAvailable).toBe(true)

  await replaceAccountWith('user-2')

  expect(result.current.createGrantAvailable).toBe(false)
})

it('keeps the grant when the same account recovers from a rejected refresh', async () => {
  const { result } = renderManagement()

  await recoverSameAccount('user-1')

  expect(result.current.createGrantAvailable).toBe(true)
})
