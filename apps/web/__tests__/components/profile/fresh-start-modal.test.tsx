import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error'
import { getHeldAccountId, useAuthStore } from '@/stores/auth-store'
import { destructiveFailureCases, destructiveActionMessage } from '@orbit/shared/test-support/destructive-action-fixtures'
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expectSmallSheetActions, sheetSlotButtons } from '@/__tests__/support/sheet-slots'
import { advanceAccountGeneration } from '@/lib/session-epoch'

const failureCopy = vi.hoisted(() => ({ actual: false, locale: 'en', realAdapter: false }))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (failureCopy.actual) return destructiveActionMessage(failureCopy.locale, key)
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

const mockRouterPush = vi.fn()
const mockRouterRefresh = vi.fn()
vi.mock('next/navigation', async (importOriginal) => ({
  ...await importOriginal<typeof import('next/navigation')>(),
  useRouter: () => ({
    push: mockRouterPush,
    refresh: mockRouterRefresh,
  }),
}))

const mockResetAccountQueries = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@orbit/shared/query', async (importOriginal) => ({
  ...await importOriginal<typeof import('@orbit/shared/query')>(),
  resetAccountQueries: mockResetAccountQueries,
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({}),
}))

const mockResetAccount = vi.fn()
vi.mock('@/app/actions/profile', () => ({
  resetAccount: (...args: unknown[]) => mockResetAccount(...args),
  updateName: vi.fn(),
  updateTimezone: vi.fn(),
  updateLanguage: vi.fn(),
  updateAiSummary: vi.fn(),
  updateProactiveOrbit: vi.fn(),
  updateMarketingConsent: vi.fn(),
  updateWeekStartDay: vi.fn(),
  updateClockFormat: vi.fn(),
  updateThemePreference: vi.fn(),
  updateMascotMotion: vi.fn(),
  completeOnboarding: vi.fn(),
  exportUserData: vi.fn(),
  authorizeNotion: vi.fn(),
  completeNotion: vi.fn(),
  disconnectNotion: vi.fn(),
}))
vi.mock('@/lib/actions/profile', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/actions/profile')>()
  return { resetAccount: (...args: Parameters<typeof original.resetAccount>) => failureCopy.realAdapter ? original.resetAccount(...args) : mockResetAccount(...args) }
})

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

import { sheetTestControls } from '@/__tests__/support/sheet-double'

import { buildAccountScopedStorageKey } from '@orbit/shared/utils'
import { FreshStartModal } from '@/app/(app)/profile/_components/fresh-start-modal'
import {
  holdAccount,
  retireHeldAccount,
  recoverSameAccount,
  replaceAccountWith,
} from '@/__tests__/support/account-change'

describe('FreshStartModal', () => {
  beforeEach(() => {
    failureCopy.actual = false; failureCopy.locale = 'en'; failureCopy.realAdapter = false
    vi.clearAllMocks()
    mockResetAccount.mockResolvedValue(undefined)
    holdAccount('user-1')
    mockResetAccountQueries.mockClear()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <FreshStartModal open={false} onOpenChange={vi.fn()} />,
    )
    expect(container.querySelector('[data-testid="overlay"]')).not.toBeInTheDocument()
  })

  it('shows info step by default with description', () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('profile.freshStart.description')).toBeInTheDocument()
  })

  it('shows deleted items list in info step', () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('profile.freshStart.willDelete')).toBeInTheDocument()
    expect(screen.getByText('profile.freshStart.deleteHabits')).toBeInTheDocument()
    expect(screen.getByText('profile.freshStart.deleteGoals')).toBeInTheDocument()
    expect(screen.getByText('profile.freshStart.deleteChat')).toBeInTheDocument()
    expect(screen.getByText('profile.freshStart.deleteAchievements')).toBeInTheDocument()
    expect(screen.getByText('profile.freshStart.deleteNotifications')).toBeInTheDocument()
    expect(screen.getByText('profile.freshStart.deleteChecklist')).toBeInTheDocument()
    expect(screen.getByText('profile.freshStart.deleteOnboarding')).toBeInTheDocument()
  })

  it('shows preserved items list in info step', () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('profile.freshStart.willKeep')).toBeInTheDocument()
    expect(screen.getByText('profile.freshStart.preserveAccount')).toBeInTheDocument()
    expect(screen.getByText('profile.freshStart.preserveSubscription')).toBeInTheDocument()
    expect(screen.getByText('profile.freshStart.preservePreferences')).toBeInTheDocument()
  })

  it('confirm button becomes enabled when user types ORBIT', () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText('profile.freshStart.reviewDeletion'))

    const input = screen.getByPlaceholderText('profile.freshStart.confirmPlaceholder')
    fireEvent.change(input, { target: { value: 'ORBIT' } })

    const confirmBtn = screen.getByRole('button', { name: 'profile.freshStart.deleteData' })
    expect(confirmBtn).not.toBeDisabled()
  })

  it('accepts case-insensitive ORBIT input', () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText('profile.freshStart.reviewDeletion'))

    const input = screen.getByPlaceholderText('profile.freshStart.confirmPlaceholder')
    fireEvent.change(input, { target: { value: 'orbit' } })

    const confirmBtn = screen.getByRole('button', { name: 'profile.freshStart.deleteData' })
    expect(confirmBtn).not.toBeDisabled()
  })

  it('calls resetAccount when confirmed', async () => {
    const onOpenChange = vi.fn()
    render(<FreshStartModal open={true} onOpenChange={onOpenChange} />)

    fireEvent.click(screen.getByText('profile.freshStart.reviewDeletion'))

    const input = screen.getByPlaceholderText('profile.freshStart.confirmPlaceholder')
    fireEvent.change(input, { target: { value: 'ORBIT' } })

    fireEvent.click(screen.getByText('profile.freshStart.deleteData'))

    await waitFor(() => {
      expect(mockResetAccount).toHaveBeenCalledTimes(1)
    })
  })

  it('keeps the next account intact when reset finishes after an account switch', async () => {
    let finishReset!: () => void
    mockResetAccount.mockReturnValueOnce(new Promise<void>((resolve) => { finishReset = resolve }))
    const onOpenChange = vi.fn()
    render(<FreshStartModal open={true} onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByText('profile.freshStart.reviewDeletion'))
    fireEvent.change(screen.getByPlaceholderText('profile.freshStart.confirmPlaceholder'), { target: { value: 'ORBIT' } })
    fireEvent.click(screen.getByText('profile.freshStart.deleteData'))
    await waitFor(() => expect(mockResetAccount).toHaveBeenCalledOnce())

    await act(async () => {
      advanceAccountGeneration()
      finishReset()
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(mockResetAccountQueries).not.toHaveBeenCalled()
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('shows error when resetAccount fails', async () => {
    mockResetAccount.mockRejectedValueOnce(new Error('Server error'))

    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText('profile.freshStart.reviewDeletion'))

    const input = screen.getByPlaceholderText('profile.freshStart.confirmPlaceholder')
    fireEvent.change(input, { target: { value: 'ORBIT' } })

    fireEvent.click(screen.getByText('profile.freshStart.deleteData'))

    await waitFor(() => {
      expect(screen.getByText('profile.freshStart.errorGeneric')).toBeInTheDocument()
    })
    expect(screen.queryByText('Server error')).not.toBeInTheDocument()
    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(mockResetAccountQueries).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(getHeldAccountId()).toBe('user-1')
  })

  it('submits the reset on Enter once ORBIT is typed', async () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText('profile.freshStart.reviewDeletion'))

    const input = screen.getByPlaceholderText('profile.freshStart.confirmPlaceholder')
    fireEvent.change(input, { target: { value: 'ORBIT' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mockResetAccount).toHaveBeenCalledTimes(1)
    })
  })

  it('ignores Enter while the confirmation text is invalid', () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText('profile.freshStart.reviewDeletion'))

    const input = screen.getByPlaceholderText('profile.freshStart.confirmPlaceholder')
    fireEvent.change(input, { target: { value: 'ORB' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mockResetAccount).not.toHaveBeenCalled()
  })
})

describe('FreshStartModal guided confirmation and account safety', () => {
  const INSTRUCTION = 'profile.freshStart.confirmInstruction'
  const TRIAL_KEY = 'orbit_trial_expired_seen'

  beforeEach(() => {
    failureCopy.actual = false; failureCopy.locale = 'en'; failureCopy.realAdapter = false
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    localStorage.clear()
    mockResetAccount.mockResolvedValue(undefined)
    holdAccount('user-1')
    mockResetAccountQueries.mockClear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  function armTheErasure(onOpenChange = vi.fn()) {
    render(<FreshStartModal open onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'profile.freshStart.reviewDeletion' }))
    const field = screen.getByLabelText(INSTRUCTION)
    fireEvent.change(field, { target: { value: 'ORBIT' } })
    return field
  }
  const deleteData = () => screen.getByRole('button', { name: 'profile.freshStart.deleteData' })

  it.each(['click', 'Enter'])('resets once when Delete data is confirmed twice by %s', async (method) => {
    let reject!: (error: Error) => void
    mockResetAccount.mockReturnValueOnce(new Promise<void>((_resolve, rejectRequest) => { reject = rejectRequest }))
    const field = armTheErasure()
    const submit = deleteData()
    act(() => {
      fireEvent.click(submit)
      if (method === 'Enter') fireEvent.keyDown(field, { key: 'Enter' })
      else fireEvent.click(submit)
    })
    expect(mockResetAccount).toHaveBeenCalledOnce()
    await act(async () => reject(new Error('Failed')))
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(getHeldAccountId()).toBe('user-1')
  })

  it('does not reset without an account', async () => {
    await retireHeldAccount()
    armTheErasure()
    fireEvent.click(deleteData())
    expect(mockResetAccount).not.toHaveBeenCalled()
  })

  it.each(destructiveFailureCases.flatMap(scenario => ['en', 'pt-BR'].map(locale => ({ ...scenario, locale }))))('shows $kind failure copy in $locale and preserves session and local data', async ({ createError, key, locale }) => {
    failureCopy.actual = true; failureCopy.locale = locale
    const keys = ['orbit-checklist-templates', TRIAL_KEY, buildAccountScopedStorageKey(TRIAL_KEY, 'user-1')]
    for (const storageKey of keys) localStorage.setItem(storageKey, 'saved')
    mockResetAccount.mockRejectedValueOnce(createError())
    const onOpenChange = vi.fn()
    render(<FreshStartModal open onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByText(destructiveActionMessage(locale, 'profile.freshStart.reviewDeletion')))
    fireEvent.change(screen.getByLabelText(destructiveActionMessage(locale, 'profile.freshStart.confirmInstruction')), { target: { value: 'ORBIT' } })
    const label = destructiveActionMessage(locale, 'profile.freshStart.deleteData')
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(await screen.findByRole('alert')).toHaveTextContent(destructiveActionMessage(locale, key ?? 'profile.freshStart.errorGeneric'))
    expect(screen.getByRole('button', { name: label })).toBeEnabled()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(getHeldAccountId()).toBe('user-1')
    for (const storageKey of keys) expect(localStorage.getItem(storageKey)).toBe('saved')
    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(mockResetAccountQueries).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('clears the stale-build busy state without losing data when the reload was already attempted', async () => {
    failureCopy.realAdapter = true
    sessionStorage.setItem('orbit-stale-build-reload', process.env.NEXT_PUBLIC_WEB_COMMIT_SHA || 'unknown')
    const keys = ['orbit-checklist-templates', TRIAL_KEY, buildAccountScopedStorageKey(TRIAL_KEY, 'user-1')]
    for (const storageKey of keys) localStorage.setItem(storageKey, 'saved')
    mockResetAccount.mockRejectedValueOnce(new UnrecognizedActionError('Unknown action'))
    const onOpenChange = vi.fn()
    armTheErasure(onOpenChange)
    fireEvent.click(deleteData())
    await waitFor(() => expect(deleteData()).toBeEnabled())
    expect(screen.getByRole('alert')).toBeInTheDocument()
    for (const storageKey of keys) expect(localStorage.getItem(storageKey)).toBe('saved')
    expect(mockResetAccountQueries).not.toHaveBeenCalled()
    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(getHeldAccountId()).toBe('user-1')
  })

  it('keeps the replacement account intact when a pending reset fails', async () => {
    let reject!: (error: Error) => void
    mockResetAccount.mockReturnValueOnce(new Promise<void>((_resolve, rejectRequest) => { reject = rejectRequest }))
    armTheErasure()
    fireEvent.click(deleteData())
    await replaceAccountWith('user-2')
    mockResetAccountQueries.mockClear()
    await act(async () => reject(new Error('Old failure')))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'profile.freshStart.reviewDeletion' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(mockResetAccountQueries).not.toHaveBeenCalled()
    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(getHeldAccountId()).toBe('user-2')
  })

  it('disarms the typed confirmation when another account replaces the tab', async () => {
    armTheErasure()

    await replaceAccountWith('user-2')

    expect(screen.getByText('profile.freshStart.description')).toBeInTheDocument()
    expect(screen.queryByLabelText(INSTRUCTION)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'profile.freshStart.reviewDeletion' }))
    expect(screen.getByLabelText(INSTRUCTION)).toHaveValue('')
  })

  it('keeps the typed confirmation when the same account recovers from a rejected refresh', async () => {
    armTheErasure()

    await recoverSameAccount('user-1')

    expect(screen.getByLabelText(INSTRUCTION)).toHaveValue('ORBIT')
  })

  it('does not clear the next account after a delayed reset completes', async () => {
    let releaseReset!: () => void
    mockResetAccount.mockImplementationOnce(() => new Promise<void>((resolve) => { releaseReset = resolve }))
    const nextNoticeKey = buildAccountScopedStorageKey(TRIAL_KEY, 'user-2')
    localStorage.setItem(nextNoticeKey, '1')
    armTheErasure()
    fireEvent.click(deleteData())

    await replaceAccountWith('user-2')
    const resetsAfterAccountChange = mockResetAccountQueries.mock.calls.length
    await act(async () => { releaseReset(); await Promise.resolve() })

    expect(localStorage.getItem(nextNoticeKey)).toBe('1')
    expect(mockResetAccountQueries).toHaveBeenCalledTimes(resetsAfterAccountChange)
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('lets the trial notice appear again after the reset, whichever key suppressed it', async () => {
    const scopedKey = buildAccountScopedStorageKey(TRIAL_KEY, 'user-1')
    localStorage.setItem(TRIAL_KEY, '1')
    localStorage.setItem(scopedKey, '1')
    localStorage.setItem('orbit-checklist-templates', '[]')
    localStorage.setItem('orbit:checklist-templates', '[]')
    armTheErasure()
    await act(async () => { fireEvent.click(deleteData()) })

    expect(mockResetAccount).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(scopedKey)).toBeNull()
    expect(localStorage.getItem(TRIAL_KEY)).toBeNull()
    expect(localStorage.getItem('orbit-checklist-templates')).toBeNull()
    expect(localStorage.getItem('orbit:checklist-templates')).toBeNull()
    expect(mockResetAccountQueries).toHaveBeenCalledOnce()
    expect(document.querySelector('[data-result-dialog]')).not.toBeNull()
  })
})
