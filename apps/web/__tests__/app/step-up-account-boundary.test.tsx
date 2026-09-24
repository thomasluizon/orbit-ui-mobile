import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { getStepUpStorageKey } from '@orbit/shared/utils'
import { API } from '@orbit/shared/api'
import { StepUpScreen } from '@/app/step-up/step-up-screen'
import {
  holdAccount,
  recoverSameAccount,
  replaceAccountWith,
  respondWithAccount,
} from '@/__tests__/support/account-change'
import { getHeldAccountId, useAuthStore } from '@/stores/auth-store'
import { hasApiKeyCreationGrant } from '@/lib/step-up-storage'

const mocks = vi.hoisted(() => ({
  operation: 'keys',
  router: { replace: vi.fn() },
  serverAuthFetch: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => new URLSearchParams(`operation=${mocks.operation}`),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { email: 'person@example.com', hasProAccess: false } }),
}))
vi.mock('@/hooks/use-date-format', () => ({
  useDateFormat: () => ({ displayDate: (value: string) => value }),
}))
vi.mock('@/lib/server-fetch', () => ({
  serverAuthFetch: (...args: unknown[]) => mocks.serverAuthFetch(...args),
}))
vi.mock('@/components/shell/flow-shell', () => ({
  FlowShell: ({ children, action }: Readonly<{ children: React.ReactNode; action?: React.ReactNode }>) => (
    <main><section>{children}</section><footer data-testid="shell-action">{action}</footer></main>
  ),
}))

function storeChallenge(accountId: string, operation: 'keys' | 'delete' = 'keys', sentAt = Date.now()) {
  globalThis.localStorage.setItem(
    getStepUpStorageKey(operation, accountId),
    JSON.stringify({ operation, sentAt }),
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function renderChallenge(operation: 'keys' | 'delete' = 'keys') {
  mocks.operation = operation
  holdAccount('user-1')
  respondWithAccount('user-1')
  storeChallenge('user-1', operation, Date.now() - 60_000)
  await act(async () => { render(<StepUpScreen serverAccountId="user-1" />) })
  return screen.getByLabelText('codeLabel')
}

function confirmCode() {
  fireEvent.change(screen.getByLabelText('codeLabel'), { target: { value: '123456' } })
  fireEvent.click(within(screen.getByTestId('shell-action')).getByRole('button'))
}

beforeEach(() => {
  globalThis.localStorage.clear()
  vi.stubGlobal('fetch', vi.fn())
  mocks.router.replace.mockReset()
  mocks.serverAuthFetch.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('discards a deferred key confirmation after account replacement', async () => {
  const pending = deferred<{ message: string }>()
  mocks.serverAuthFetch.mockImplementation((endpoint: string) =>
    endpoint === API.apiKeys.confirmCreationChallenge ? pending.promise : Promise.resolve({ message: 'sent' }),
  )
  await renderChallenge()
  confirmCode()
  await waitFor(() => expect(mocks.serverAuthFetch).toHaveBeenCalledWith(
    API.apiKeys.confirmCreationChallenge,
    { method: 'POST', body: JSON.stringify({ code: '123456' }) },
  ))
  storeChallenge('user-2')
  await replaceAccountWith('user-2')
  mocks.router.replace.mockClear()

  await act(async () => { pending.resolve({ message: 'confirmed' }); await pending.promise })

  expect(hasApiKeyCreationGrant()).toBe(false)
  expect(mocks.router.replace).not.toHaveBeenCalled()
  expect(screen.getByLabelText('codeLabel')).toHaveValue('')
})

it('discards a deferred deletion failure after account replacement', async () => {
  const pending = deferred<never>()
  mocks.serverAuthFetch.mockImplementation((endpoint: string) =>
    endpoint === API.auth.confirmDeletion ? pending.promise : Promise.resolve({ message: 'sent' }),
  )
  await renderChallenge('delete')
  confirmCode()
  await waitFor(() => expect(mocks.serverAuthFetch).toHaveBeenCalledWith(
    API.auth.confirmDeletion,
    { method: 'POST', body: JSON.stringify({ code: '123456' }) },
  ))
  storeChallenge('user-2', 'delete')
  await replaceAccountWith('user-2')

  await act(async () => { pending.reject(new Error('old request failed')); await pending.promise.catch(() => {}) })

  expect(screen.getByLabelText('codeLabel')).toHaveValue('')
  expect(screen.queryByText('genericError')).not.toBeInTheDocument()
})

it('discards a deferred resend after account replacement', async () => {
  const pending = deferred<{ message: string }>()
  mocks.serverAuthFetch.mockImplementation((endpoint: string) =>
    endpoint === API.apiKeys.requestCreationChallenge ? pending.promise : Promise.resolve({ message: 'sent' }),
  )
  await renderChallenge()
  fireEvent.click(screen.getByText('resend'))
  await waitFor(() => expect(mocks.serverAuthFetch).toHaveBeenCalledWith(
    API.apiKeys.requestCreationChallenge, { method: 'POST' },
  ))
  const nextSentAt = Date.now() - 61_000
  storeChallenge('user-2', 'keys', nextSentAt)
  await replaceAccountWith('user-2')

  await act(async () => { pending.resolve({ message: 'sent' }); await pending.promise })

  expect(JSON.parse(globalThis.localStorage.getItem(getStepUpStorageKey('keys', 'user-2')) ?? '{}'))
    .toMatchObject({ sentAt: nextSentAt })
  expect(screen.getByText('resend')).toBeInTheDocument()
})

it('retires the server account after a poll finds an inactive session', async () => {
  vi.useFakeTimers()
  await renderChallenge()
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true, status: 200, json: () => Promise.resolve({ expiresAt: null }),
  } as Response)

  await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })

  expect(getHeldAccountId()).toBeNull()
  expect(screen.queryByLabelText('codeLabel')).not.toBeInTheDocument()
  expect(mocks.router.replace).toHaveBeenCalledWith('/login')
})

it('retires the server account after a cross-tab sign-out', async () => {
  await renderChallenge()

  act(() => { useAuthStore.getState().adoptAccountFromSignal(null) })

  expect(getHeldAccountId()).toBeNull()
  expect(screen.queryByLabelText('codeLabel')).not.toBeInTheDocument()
  expect(mocks.router.replace).toHaveBeenCalledWith('/login')
})

it('keeps the challenge and typed code through same-account recovery', async () => {
  await renderChallenge()
  fireEvent.change(screen.getByLabelText('codeLabel'), { target: { value: '123456' } })

  await recoverSameAccount('user-1')

  expect(screen.getByLabelText('codeLabel')).toHaveValue('123456')
  expect(mocks.router.replace).not.toHaveBeenCalledWith('/login')
})
