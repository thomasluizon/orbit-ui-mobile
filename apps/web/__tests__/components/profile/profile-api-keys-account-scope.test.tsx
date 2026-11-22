import { chooseApiKeyCreation } from '@/__tests__/support/api-key-creation'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { bindStepUpStateToAccount, retainApiKeyExpiryDraft, clearApiKeyCreationGrant, hasApiKeyCreationGrant, markStepUpVerified, readStepUpTiming } from '@/lib/step-up-storage'
import { confirmApiKeyCreationChallenge, requestApiKeyCreationChallenge } from '@/lib/actions/api-keys'
import { resetAuthStore, retireHeldAccount } from '@/__tests__/support/account-change'
import type { ApiKey } from '@orbit/shared/types'
import type { Profile } from '@orbit/shared/types/profile'
import { expectSmallSheetActions, sheetSlotButtons } from '@/__tests__/support/sheet-slots'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

const management = vi.hoisted(() => ({ locale: 'en' as 'en' | 'pt-BR', handleCreateKey: vi.fn(), push: vi.fn(), replace: vi.fn(), canCreate: true, grantAvailable: true, error: null as string | null, apiKeys: [] as ApiKey[], loading: false, loadError: null as Error | null, retry: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => management, useSearchParams: () => new URLSearchParams('operation=keys') }))
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  const messages = (await import('@orbit/shared/i18n/en.json')).default
  const portugueseMessages = (await import('@orbit/shared/i18n/pt-BR.json')).default
  return {
    ...actual,
    useLocale: () => management.locale,
    useTranslations: (namespace?: 'stepUp') => actual.createTranslator({ locale: management.locale, messages: management.locale === 'en' ? messages : portugueseMessages, namespace }),
  }
})
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/lib/actions/api-keys', () => ({ requestApiKeyCreationChallenge: vi.fn(), confirmApiKeyCreationChallenge: vi.fn() }))
vi.mock('@/hooks/use-api-key-management', () => ({
  useApiKeyManagement: () => ({
    apiKeysQuery: { isLoading: management.loading, error: management.loadError, refetch: management.retry },
    apiKeys: management.apiKeys,
    canCreateKey: management.canCreate,
    createGrantAvailable: management.grantAvailable,
    createKeyError: management.error,
    clearCreateKeyError: vi.fn(),
    revokingKeyId: null,
    setRevokingKeyId: vi.fn(),
    revokeKeyMutation: { mutate: vi.fn(), isPending: false },
    handleCreateKey: management.handleCreateKey,
  }),
}))

vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: undefined }) }))
vi.mock('@/components/shell/flow-shell', () => ({ FlowShell: ({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) => <div>{children}{action}</div> }))

import { StepUpScreen } from '@/app/step-up/step-up-screen'
import { ProfileApiKeys } from '@/components/profile/profile-api-keys'
import { useAuthStore } from '@/stores/auth-store'

const ACCOUNT_A_KEY = 'orbit_sk_account_a_2f8c41'

let queryClient: QueryClient

function expiryField(): HTMLElement {
  const field = screen.queryByRole('textbox', { name: en.orbitMcp.expiresAtLabel })
  if (field) return field
  fireEvent.click(screen.getByRole('button', { name: en.profile.apiKeys.setExpiry }))
  return screen.getByRole('textbox', { name: en.orbitMcp.expiresAtLabel })
}

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
  management.canCreate = true
  management.grantAvailable = true
  management.error = null
  management.apiKeys = []
  management.loading = false
  management.loadError = null
  management.retry.mockReset()
  management.handleCreateKey.mockReset()
  management.locale = 'en'
  management.push.mockReset()
  management.replace.mockReset()
  vi.mocked(confirmApiKeyCreationChallenge).mockReset()
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

  fireEvent.click(screen.getByRole('button', { name: en.orbitMcp.connectionInstructions }))
  expect(within(screen.getByRole('dialog', { name: en.orbitMcp.claudeWeb })).getByText('https://api-staging.useorbit.org/mcp')).toBeInTheDocument()
})

async function revealAccountAKey() {
  useAuthStore.getState().setAuth({ userId: 'user-1', name: 'Ada', email: 'ada@example.com' })
  render(
    <QueryClientProvider client={queryClient}>
      <ProfileApiKeys profile={proProfile()} unlocked />
    </QueryClientProvider>,
  )
  await act(async () => {
    await chooseApiKeyCreation('Create key', en.profile.apiKeys.create)
  })
  fireEvent.change(screen.getByRole('textbox', { name: en.orbitMcp.keyName }), { target: { value: 'Personal key' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.profile.apiKeys.scopeAction })) })
  expect(screen.getByText(ACCOUNT_A_KEY)).toBeInTheDocument()
  expectSmallSheetActions()
}

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

async function submitNamedKey() {
  fireEvent.change(screen.getByRole('textbox', { name: en.orbitMcp.keyName }), { target: { value: 'Personal key' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: en.profile.apiKeys.scopeAction })) })
}

function renderUnlockedKeys() {
  useAuthStore.getState().setAuth({ userId: 'user-1', name: 'Ada', email: 'ada@example.com' })
  return render(<QueryClientProvider client={queryClient}><ProfileApiKeys profile={proProfile()} unlocked /></QueryClientProvider>)
}

async function submitScopedKey() {
  await chooseApiKeyCreation(en.profile.apiKeys.createScoped, en.profile.apiKeys.create)
  fireEvent.change(screen.getByLabelText(en.profile.apiKeys.scopeLabel), { target: { value: 'habits:read' } })
  await submitNamedKey()
}

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

it.each(['en', 'pt-BR'] as const)('reads existing key expiry without opening creation or reveal in %s', (locale) => {
  management.locale = locale
  const messages = locale === 'en' ? en : ptBR
  const t = createTranslator({ locale, messages })
  management.apiKeys = [{ ...detailKey, expiresAtUtc: null }]
  const view = renderKeyDetails()
  expect(screen.getByText(messages.common.never)).toBeVisible()
  expect(screen.getByRole('button', { name: t('profile.apiKeys.revokeNamed', { name: detailKey.name }) })).toBeInTheDocument()
  expect(screen.getByText(messages.orbitMcp.permReadOnly)).toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: messages.orbitMcp.expiresAtLabel })).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(management.handleCreateKey).not.toHaveBeenCalled()

  management.apiKeys = [detailKey]
  view.rerender(<QueryClientProvider client={queryClient}><ProfileApiKeys profile={proProfile()} unlocked /></QueryClientProvider>)
  expect(screen.queryByText(messages.common.never)).not.toBeInTheDocument()
  expect(screen.getByText(locale === 'en' ? 'Expires Apr 5, 2027' : 'Expira em 5 de abr. de 2027')).toBeVisible()
})

it('withholds key details while access is locked or the list is loading', () => {
  management.apiKeys = [detailKey]
  const view = renderKeyDetails(false)
  expect(screen.queryByText('External tool')).not.toBeInTheDocument()
  management.loading = true
  view.rerender(<QueryClientProvider client={queryClient}><ProfileApiKeys profile={proProfile()} unlocked /></QueryClientProvider>)
  const skeleton = screen.getByRole('progressbar', { name: en.common.loading })
  expect(skeleton).toHaveAttribute('data-variant', 'settings')
  expect(skeleton).toHaveAttribute('aria-busy', 'true')
  expect(skeleton.querySelectorAll('[data-settings-skeleton-row]')).toHaveLength(2)
  expect(screen.queryByText(en.common.loading)).toBeNull()
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
