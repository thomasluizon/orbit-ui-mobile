import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { readStepUpTiming } from '@/lib/step-up-storage'
import { requestApiKeyCreationChallenge } from '@/lib/actions/api-keys'
import { resetAuthStore, retireHeldAccount } from '@/__tests__/support/account-change'
import type { ApiKey } from '@orbit/shared/types'
import type { Profile } from '@orbit/shared/types/profile'
import { expectSmallSheetActions, sheetSlotButtons } from '@/__tests__/support/sheet-slots'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

const management = vi.hoisted(() => ({ handleCreateKey: vi.fn(), push: vi.fn(), error: null as string | null, locale: 'en' as 'en' | 'pt-BR', apiKeys: [] as ApiKey[], loading: false, loadError: null as Error | null, retry: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: management.push }) }))
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  const messages = (await import('@orbit/shared/i18n/en.json')).default
  const portugueseMessages = (await import('@orbit/shared/i18n/pt-BR.json')).default
  return {
    ...actual,
    useLocale: () => management.locale,
    useTranslations: () => actual.createTranslator({ locale: management.locale, messages: management.locale === 'en' ? messages : portugueseMessages }),
  }
})
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/lib/actions/api-keys', () => ({ requestApiKeyCreationChallenge: vi.fn() }))
vi.mock('@/hooks/use-api-key-management', () => ({
  useApiKeyManagement: () => ({
    apiKeysQuery: { isLoading: management.loading, error: management.loadError, refetch: management.retry },
    apiKeys: management.apiKeys,
    canCreateKey: true,
    createGrantAvailable: true,
    createKeyError: management.error,
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

beforeEach(async () => {
  vi.stubGlobal('fetch', vi.fn())
  await resetAuthStore()
  localStorage.clear()
  vi.mocked(requestApiKeyCreationChallenge).mockReset()
  management.apiKeys = []
  management.loading = false
  management.loadError = null
  management.handleCreateKey.mockReset()
  management.error = null
  management.locale = 'en'
  management.push.mockReset()
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  management.handleCreateKey.mockResolvedValue({ id: 'key-1', name: 'Orbit key', key: ACCOUNT_A_KEY })
})

afterEach(async () => {
  cleanup()
  queryClient.clear()
  await resetAuthStore()
  localStorage.clear()
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
  fireEvent.change(screen.getByRole('textbox', { name: en.orbitMcp.keyName }), { target: { value: 'Personal key' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.profile.apiKeys.scopeAction })) })
  expect(screen.getByText(ACCOUNT_A_KEY)).toBeInTheDocument()
  expectSmallSheetActions()
}

it('uses small intrinsic Cancel then Create actions in the scoped-key sheet', () => {
  useAuthStore.getState().setAuth({ userId: 'user-1', name: 'Ada', email: 'ada@example.com' })
  render(<QueryClientProvider client={queryClient}><ProfileApiKeys profile={proProfile()} unlocked /></QueryClientProvider>)
  fireEvent.click(screen.getByRole('button', { name: en.profile.apiKeys.createScoped }))
  expect(sheetSlotButtons('sheet-actions')).toEqual([en.common.cancel, en.profile.apiKeys.scopeAction])
  expectSmallSheetActions()
  expect(screen.getByRole('button', { name: en.profile.apiKeys.scopeAction })).toBeDisabled()
  fireEvent.change(screen.getByRole('textbox', { name: en.profile.apiKeys.scopeLabel }), { target: { value: 'habits:read' } })
  expect(screen.getByRole('button', { name: en.profile.apiKeys.scopeAction })).toBeEnabled()
})

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
  fireEvent.change(screen.getByRole('textbox', { name: en.orbitMcp.keyName }), { target: { value: 'Personal key' } })
  fireEvent.click(screen.getByRole('button', { name: en.profile.apiKeys.scopeAction }))

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
  expect(readStepUpTiming('keys', 'user-1')).toBeNull()
  expect(readStepUpTiming('keys', 'user-2')).toBeNull()
  fireEvent.click(screen.getByText('Open the keys'))
  fireEvent.click(screen.getByText('Sign in again'))

  respondWithAccount('user-2')
  await act(async () => { await useAuthStore.getState().checkSession() })
  await act(async () => { releaseChallenge(); await Promise.resolve() })

  expect(readStepUpTiming('keys', 'user-1')).toBeNull()
  expect(readStepUpTiming('keys', 'user-2')).toBeNull()
  expect(management.push).not.toHaveBeenCalled()
  expect(screen.queryByText('Sign in again')).not.toBeInTheDocument()

  vi.mocked(requestApiKeyCreationChallenge).mockResolvedValueOnce(undefined as never)
  fireEvent.click(screen.getByText('Open the keys'))
  await act(async () => { fireEvent.click(screen.getByText('Sign in again')) })

  expect(readStepUpTiming('keys', 'user-1')).toBeNull()
  expect(readStepUpTiming('keys', 'user-2')).not.toBeNull()
  expect(management.push).toHaveBeenCalledExactlyOnceWith('/step-up?operation=keys')
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

it.each([false, true])('asks for a name before creating a key with scoped=%s', async (scoped) => {
  useAuthStore.getState().setAuth({ userId: 'user-1', name: 'Ada', email: 'ada@example.com' })
  render(<QueryClientProvider client={queryClient}><ProfileApiKeys profile={proProfile()} unlocked /></QueryClientProvider>)
  fireEvent.click(screen.getByRole('button', { name: scoped ? en.profile.apiKeys.createScoped : en.profile.apiKeys.create }))
  expect(management.handleCreateKey).not.toHaveBeenCalled()
  const name = screen.getByRole('textbox', { name: en.orbitMcp.keyName })
  expect(name).toHaveAttribute('placeholder', en.orbitMcp.keyNamePlaceholder)
  expect(name).toBeRequired()
  if (scoped) fireEvent.change(screen.getByRole('textbox', { name: en.profile.apiKeys.scopeLabel }), { target: { value: ' habits:read ' } })
  const submit = screen.getByRole('button', { name: en.profile.apiKeys.scopeAction })
  fireEvent.change(name, { target: { value: '   ' } })
  fireEvent.click(submit)
  expect(name).toHaveAccessibleDescription(en.orbitMcp.keyNameRequired)
  expect(name).toHaveFocus()
  expect(management.handleCreateKey).not.toHaveBeenCalled()
  fireEvent.change(name, { target: { value: 'x'.repeat(51) } })
  fireEvent.keyDown(name, { key: 'Enter' })
  expect(name).toHaveAccessibleDescription(en.orbitMcp.keyNameMaxLength)
  expect(management.handleCreateKey).not.toHaveBeenCalled()
  fireEvent.change(name, { target: { value: `  ${'x'.repeat(50)}  ` } })
  await act(async () => { fireEvent.click(submit) })
  expect(management.handleCreateKey).toHaveBeenCalledWith(
    { name: 'x'.repeat(50), ...(scoped ? { scopes: ['habits:read'] } : {}) },
    expect.any(Function),
  )
  expect(screen.getByText(ACCOUNT_A_KEY)).toBeInTheDocument()
})

it('keeps the name after a failed request and disables repeat submissions while pending', async () => {
  let finish!: () => void
  management.handleCreateKey.mockImplementationOnce(() => new Promise((resolve) => {
    finish = () => { management.error = en.orbitMcp.createKeyError; resolve(null) }
  }))
  useAuthStore.getState().setAuth({ userId: 'user-1', name: 'Ada', email: 'ada@example.com' })
  render(<QueryClientProvider client={queryClient}><ProfileApiKeys profile={proProfile()} unlocked /></QueryClientProvider>)
  fireEvent.click(screen.getByRole('button', { name: en.profile.apiKeys.create }))
  const name = screen.getByRole('textbox', { name: en.orbitMcp.keyName })
  fireEvent.change(name, { target: { value: 'Home automation' } })
  const submit = screen.getByRole('button', { name: en.profile.apiKeys.scopeAction })
  fireEvent.click(submit)
  expect(submit).toBeDisabled()
  expect(submit).toHaveAttribute('data-loading')
  expect(name).toBeDisabled()
  expect(screen.getByRole('button', { name: en.common.cancel })).toBeDisabled()
  fireEvent.keyDown(name, { key: 'Enter' })
  expect(management.handleCreateKey).toHaveBeenCalledTimes(1)
  await act(async () => finish())
  expect(screen.getByRole('alert')).toHaveTextContent(en.orbitMcp.createKeyError)
  expect(name).toHaveValue('Home automation')
  expect(submit).toBeEnabled()
  management.error = null
  await act(async () => { fireEvent.click(submit) })
  expect(screen.getByText(ACCOUNT_A_KEY)).toBeInTheDocument()
})

it('clears the name when creation is explicitly cancelled', () => {
  useAuthStore.getState().setAuth({ userId: 'user-1', name: 'Ada', email: 'ada@example.com' })
  render(<QueryClientProvider client={queryClient}><ProfileApiKeys profile={proProfile()} unlocked /></QueryClientProvider>)
  fireEvent.click(screen.getByRole('button', { name: en.profile.apiKeys.create }))
  fireEvent.change(screen.getByRole('textbox', { name: en.orbitMcp.keyName }), { target: { value: 'Cancelled key' } })
  fireEvent.click(screen.getByRole('button', { name: en.common.cancel }))
  fireEvent.click(screen.getByRole('button', { name: en.common.keepEditing }))
  expect(screen.getByRole('textbox', { name: en.orbitMcp.keyName })).toHaveValue('Cancelled key')
  fireEvent.click(screen.getByRole('button', { name: en.common.cancel }))
  fireEvent.click(screen.getByRole('button', { name: en.common.discardChangesAction }))
  fireEvent.click(screen.getByRole('button', { name: en.profile.apiKeys.create }))
  expect(screen.getByRole('textbox', { name: en.orbitMcp.keyName })).toHaveValue('')
  expect(management.handleCreateKey).not.toHaveBeenCalled()
})


it.each([['en', en], ['pt-BR', ptBR]] as const)('labels the name and required error in %s', (locale, messages) => {
  management.locale = locale
  useAuthStore.getState().setAuth({ userId: 'user-1', name: 'Ada', email: 'ada@example.com' })
  render(<QueryClientProvider client={queryClient}><ProfileApiKeys profile={proProfile()} unlocked /></QueryClientProvider>)
  fireEvent.click(screen.getByRole('button', { name: messages.profile.apiKeys.create }))
  const name = screen.getByRole('textbox', { name: messages.orbitMcp.keyName })
  expect(name).toHaveAttribute('placeholder', messages.orbitMcp.keyNamePlaceholder)
  fireEvent.click(screen.getByRole('button', { name: messages.profile.apiKeys.scopeAction }))
  expect(name).toHaveAccessibleDescription(messages.orbitMcp.keyNameRequired)
  expect(management.handleCreateKey).not.toHaveBeenCalled()
})

const detailKey: ApiKey = {
  id: 'details-key', name: 'External tool', keyPrefix: 'orb_details', scopes: ['habits:read', 'goals:read'],
  isReadOnly: true, createdAtUtc: '2026-01-02T12:00:00Z', lastUsedAtUtc: '2026-02-03T12:00:00Z',
  expiresAtUtc: '2027-04-05T12:00:00Z', isRevoked: false,
}

function renderKeyDetails(unlocked = true) {
  return render(<QueryClientProvider client={queryClient}><ProfileApiKeys profile={proProfile()} unlocked={unlocked} /></QueryClientProvider>)
}

it('shows scopes, dates, permissions and expiry in the unlocked key list', () => {
  management.apiKeys = [detailKey]
  renderKeyDetails()
  expect(screen.getByText('habits:read, goals:read')).toBeInTheDocument()
  expect(screen.getByText('Read-only')).toBeInTheDocument()
  expect(screen.getByText('Created')).toBeInTheDocument()
  expect(screen.getByText('Jan 2, 2026')).toBeInTheDocument()
  expect(screen.getByText('Last used')).toBeInTheDocument()
  expect(screen.getByText('Feb 3, 2026')).toBeInTheDocument()
  expect(screen.getByText('Expires Apr 5, 2027')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Revoke External tool' })).toBeInTheDocument()
})

it('preserves no scopes, unused, read/write and no expiry states', () => {
  management.apiKeys = [{ ...detailKey, scopes: [], isReadOnly: false, lastUsedAtUtc: null, expiresAtUtc: null }]
  renderKeyDetails()
  expect(screen.getByText('No scopes')).toBeInTheDocument()
  expect(screen.getByText('Never')).toBeInTheDocument()
  expect(screen.getByText('Read/write')).toBeInTheDocument()
  expect(screen.queryByText(/^Expires /)).not.toBeInTheDocument()
})

it('withholds key details while access is locked or the list is loading', () => {
  management.apiKeys = [detailKey]
  const view = renderKeyDetails(false)
  expect(screen.queryByText('External tool')).not.toBeInTheDocument()
  management.loading = true
  view.rerender(<QueryClientProvider client={queryClient}><ProfileApiKeys profile={proProfile()} unlocked /></QueryClientProvider>)
  expect(screen.getByRole('status')).toHaveTextContent(en.common.loading)
  expect(screen.queryByText('habits:read, goals:read')).not.toBeInTheDocument()
})

it('offers retry instead of stale key details when loading fails', () => {
  management.apiKeys = [detailKey]
  management.loadError = new Error('unavailable')
  renderKeyDetails()
  expect(screen.getByRole('alert')).toHaveTextContent(en.orbitMcp.apiKeysError)
  expect(screen.queryByText('External tool')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: en.common.retry }))
  expect(management.retry).toHaveBeenCalledTimes(1)
})

it('localizes key details and dates in Brazilian Portuguese', () => {
  management.locale = 'pt-BR'
  management.apiKeys = [detailKey]
  renderKeyDetails()
  expect(screen.getByText(ptBR.orbitMcp.permReadOnly)).toBeInTheDocument()
  expect(screen.getByText(ptBR.orbitMcp.created)).toBeInTheDocument()
  expect(screen.getByText('2 de jan. de 2026')).toBeInTheDocument()
  expect(screen.getByText('Expira em 5 de abr. de 2027')).toBeInTheDocument()
})
