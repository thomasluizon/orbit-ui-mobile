import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient } from '@tanstack/react-query'
import { useApiKeyManagement } from '@/hooks/use-api-key-management'
import { clearStepUpState, hasApiKeyCreationGrant, markStepUpVerified } from '@/lib/step-up-storage'

const mocks = vi.hoisted(() => ({ createApiKey: vi.fn() }))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showPersistentError: vi.fn() }) }))

vi.mock('@/lib/actions/api-keys', () => ({
  createApiKey: (...args: unknown[]) => mocks.createApiKey(...args),
  revokeApiKey: vi.fn(),
}))
import {
  holdAccount,
  recoverSameAccount,
  replaceAccountWith,
} from '@/__tests__/support/account-change'

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useQueryClient: () => queryClient,
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

it('does not return an old key or consume the next account grant', async () => {
  let releaseCreate!: (value: object) => void
  mocks.createApiKey.mockImplementationOnce(() => new Promise((resolve) => {
    releaseCreate = resolve
  }))
  const { result } = renderManagement()
  let creation!: Promise<unknown>
  act(() => { creation = result.current.handleCreateKey({ name: 'A key' }, async () => {}) })

  await replaceAccountWith('user-2')
  markStepUpVerified('keys')
  let returned: unknown
  await act(async () => {
    releaseCreate({ success: true, response: { id: 'account-a-key', key: 'orbit_sk_account_a' } })
    returned = await creation
  })

  expect(returned).toBeNull()
  expect(hasApiKeyCreationGrant()).toBe(true)
})
