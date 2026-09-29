import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { readStepUpTiming } from '@/lib/step-up-storage'
import { requestApiKeyCreationChallenge } from '@/lib/actions/api-keys'
import { retireHeldAccount } from '@/__tests__/support/account-change'
import type { Profile } from '@orbit/shared/types/profile'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

const management = vi.hoisted(() => ({ handleCreateKey: vi.fn(), push: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: management.push }) }))
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  const messages = (await import('@orbit/shared/i18n/en.json')).default
  return {
    ...actual,
    useLocale: () => 'en',
    useTranslations: () => actual.createTranslator({ locale: 'en', messages }),
  }
})
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/lib/actions/api-keys', () => ({ requestApiKeyCreationChallenge: vi.fn() }))
vi.mock('@/hooks/use-api-key-management', () => ({
  useApiKeyManagement: () => ({
    apiKeysQuery: { isLoading: false, error: null, refetch: vi.fn() },
    apiKeys: [],
    canCreateKey: true,
    createGrantAvailable: true,
    createKeyError: null,
    clearCreateKeyError: vi.fn(),
    revokingKeyId: null,
    setRevokingKeyId: vi.fn(),
    revokeKeyMutation: { mutate: vi.fn(), isPending: false },
    handleCreateKey: management.handleCreateKey,
  }),
}))

import { ProfileApiKeys } from '@/components/profile/profile-api-keys'
import { useAuthStore } from '@/stores/auth-store'

const ACCOUNT_A_KEY = 'orbit_sk_account_a_2f8c41'

let queryClient: QueryClient

function proProfile(): Profile {
  return { hasProAccess: true } as Profile
}

it.each([
  [0, 'No keys yet'],
  [1, '1 active key'],
  [3, '3 active keys'],
])('shows the count before key step-up for %i active keys', (count, expected) => {
  render(
    <QueryClientProvider client={queryClient}>
      <ProfileApiKeys profile={{ ...proProfile(), activeApiKeyCount: count }} unlocked={false} />
    </QueryClientProvider>,
  )

  expect(screen.getByText('Open the keys')).toBeInTheDocument()
  expect(screen.getByText(expected)).toBeInTheDocument()
})

it.each([
  ['en', en, ['No keys yet', '1 active key', '3 active keys']],
  ['pt-BR', ptBR, ['Nenhuma chave ainda', '1 chave ativa', '3 chaves ativas']],
] as const)('formats active key counts in %s', (locale, messages, expected) => {
  const t = createTranslator({ locale, messages })
  expect(t('profile.apiKeys.noKeys')).toBe(expected[0])
  expect(t('profile.apiKeys.activeCount', { count: 1 })).toBe(expected[1])
  expect(t('profile.apiKeys.activeCount', { count: 3 })).toBe(expected[2])
})

function respondWithAccount(userId: string) {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ expiresAt: Date.now() + 3600000, userId, refreshFailed: false }),
  } as unknown as Response)
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  management.handleCreateKey.mockResolvedValue({ id: 'key-1', name: 'Orbit key', key: ACCOUNT_A_KEY })
})

afterEach(() => {
  cleanup()
  queryClient.clear()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

it('shows the MCP endpoint for the selected API environment', () => {
  vi.stubEnv('NEXT_PUBLIC_EVENT_API_BASE', 'https://api-staging.useorbit.org/')
  render(
    <QueryClientProvider client={queryClient}>
      <ProfileApiKeys profile={proProfile()} unlocked />
    </QueryClientProvider>,
  )

  expect(screen.getByText('https://api-staging.useorbit.org/mcp')).toBeInTheDocument()
})

async function revealAccountAKey() {
  useAuthStore.getState().setAuth({ userId: 'user-1', name: 'Ada', email: 'ada@example.com' })
  render(
    <QueryClientProvider client={queryClient}>
      <ProfileApiKeys profile={proProfile()} unlocked />
    </QueryClientProvider>,
  )
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }))
  })
  expect(screen.getByText(ACCOUNT_A_KEY)).toBeInTheDocument()
}

it('takes the revealed API key off the screen when another account replaces the tab', async () => {
  await revealAccountAKey()

  respondWithAccount('user-2')
  await act(async () => { await useAuthStore.getState().checkSession() })

  expect(screen.queryByText(ACCOUNT_A_KEY)).not.toBeInTheDocument()
})

it('keeps the revealed API key when the same account recovers from a rejected refresh', async () => {
  await revealAccountAKey()

  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: false, status: 401, json: () => Promise.resolve({ refreshFailed: true }),
  } as unknown as Response)
  await act(async () => { await useAuthStore.getState().confirmSessionRefreshFailure() })
  respondWithAccount('user-1')
  await act(async () => { await useAuthStore.getState().recoverSessionRefreshFailure() })

  expect(screen.getByText(ACCOUNT_A_KEY)).toBeInTheDocument()
})

it('does not reveal an old key when creation resolves after replacement', async () => {
  let releaseCreate!: (value: object) => void
  management.handleCreateKey.mockImplementationOnce(() => new Promise((resolve) => {
    releaseCreate = resolve
  }))
  useAuthStore.getState().setAuth({ userId: 'user-1', name: 'Ada', email: 'ada@example.com' })
  render(
    <QueryClientProvider client={queryClient}>
      <ProfileApiKeys profile={proProfile()} unlocked />
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Create key' }))

  respondWithAccount('user-2')
  await act(async () => { await useAuthStore.getState().checkSession() })
  await act(async () => {
    releaseCreate({ id: 'key-1', name: 'Orbit key', key: ACCOUNT_A_KEY })
    await Promise.resolve()
  })

  expect(screen.queryByText(ACCOUNT_A_KEY)).not.toBeInTheDocument()
})

it('does not route the next account after an old key challenge resolves', async () => {
  let releaseChallenge!: () => void
  vi.mocked(requestApiKeyCreationChallenge).mockImplementationOnce(() =>
    new Promise((resolve) => { releaseChallenge = () => resolve(undefined as never) }),
  )
  useAuthStore.getState().setAuth({ userId: 'user-1', name: 'Ada', email: 'ada@example.com' })
  render(
    <QueryClientProvider client={queryClient}>
      <ProfileApiKeys profile={proProfile()} unlocked={false} />
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByText('Open the keys'))
  fireEvent.click(screen.getByText('Sign in again'))

  respondWithAccount('user-2')
  await act(async () => { await useAuthStore.getState().checkSession() })
  await act(async () => { releaseChallenge(); await Promise.resolve() })

  expect(readStepUpTiming('keys', 'user-1')).toBeNull()
  expect(management.push).not.toHaveBeenCalled()
  expect(screen.queryByText('Sign in again')).not.toBeInTheDocument()
})

it('waits for the first account check before requesting an API key challenge', async () => {
  await retireHeldAccount()
  useAuthStore.setState({ isAuthenticated: true, sessionInactive: false })
  let finishSession!: (response: Response) => void
  vi.mocked(globalThis.fetch).mockImplementationOnce(() => new Promise((resolve) => {
    finishSession = resolve
  }))
  const firstCheck = useAuthStore.getState().checkSession()
  vi.mocked(requestApiKeyCreationChallenge).mockResolvedValue(undefined as never)
  render(
    <QueryClientProvider client={queryClient}>
      <ProfileApiKeys profile={proProfile()} unlocked={false} />
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByText('Open the keys'))
  const sendButton = screen.getByText('Sign in again').closest('button')!
  expect(sendButton).toBeDisabled()
  expect(sendButton).not.toHaveAttribute('data-loading')
  expect(sendButton.closest('section')).not.toHaveAttribute('aria-busy')
  fireEvent.click(sendButton)
  expect(requestApiKeyCreationChallenge).not.toHaveBeenCalled()

  await act(async () => {
    finishSession({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ expiresAt: Date.now() + 3600000, userId: 'user-1' }),
    } as Response)
    await firstCheck
  })
  fireEvent.click(screen.getByText('Open the keys'))
  fireEvent.click(screen.getByText('Sign in again'))
  await act(async () => { await Promise.resolve() })
  expect(requestApiKeyCreationChallenge).toHaveBeenCalledTimes(1)
  expect(readStepUpTiming('keys', 'user-1')).not.toBeNull()
  expect(management.push).toHaveBeenCalledWith('/step-up?operation=keys')
})
