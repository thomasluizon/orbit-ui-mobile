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
  updateProactiveAstra: vi.fn(),
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

  it.each(['click', 'Enter'])('resets once when Delete data is confirmed twice by %s', async method => {
    holdAccount('user-1')
    let reject!: (error: Error) => void
    mockResetAccount.mockReturnValueOnce(new Promise<void>((_resolve, rejectRequest) => { reject = rejectRequest }))
    render(<FreshStartModal open onOpenChange={vi.fn()} />)
    fireEvent.click(screen.getByText('profile.freshStart.reviewDeletion'))
    const field = screen.getByLabelText('profile.freshStart.confirmLabel')
    fireEvent.change(field, { target: { value: 'ORBIT' } })
    const submit = screen.getByRole('button', { name: 'profile.freshStart.deleteData' })
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
    vi.stubGlobal('fetch', vi.fn())
    await retireHeldAccount()
    render(<FreshStartModal open onOpenChange={vi.fn()} />)
    fireEvent.click(screen.getByText('profile.freshStart.reviewDeletion'))
    fireEvent.change(screen.getByLabelText('profile.freshStart.confirmLabel'), { target: { value: 'ORBIT' } })
    fireEvent.click(screen.getByText('profile.freshStart.deleteData'))
    expect(mockResetAccount).not.toHaveBeenCalled()
  })

  it.each(destructiveFailureCases.flatMap(scenario => ['en', 'pt-BR'].map(locale => ({ ...scenario, locale }))))('shows $kind failure copy in $locale and preserves session and local data', async ({ createError, key, locale }) => {
    holdAccount('user-1')
    mockResetAccountQueries.mockClear()
    failureCopy.actual = true; failureCopy.locale = locale
    const keys = ['orbit-checklist-templates', 'orbit_trial_expired_seen', buildAccountScopedStorageKey('orbit_trial_expired_seen', 'user-1')]
    for (const storageKey of keys) localStorage.setItem(storageKey, 'saved')
    mockResetAccount.mockRejectedValueOnce(createError())
    const onOpenChange = vi.fn()
    render(<FreshStartModal open onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByText(destructiveActionMessage(locale, 'profile.freshStart.reviewDeletion')))
    fireEvent.change(screen.getByLabelText(destructiveActionMessage(locale, 'profile.freshStart.confirmLabel')), { target: { value: 'ORBIT' } })
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

  it('clears the stale-build busy state without losing data when reload was already attempted', async () => {
    holdAccount('user-1')
    mockResetAccountQueries.mockClear()
    failureCopy.realAdapter = true
    sessionStorage.setItem('orbit-stale-build-reload', process.env.NEXT_PUBLIC_WEB_COMMIT_SHA || 'unknown')
    const keys = ['orbit-checklist-templates', 'orbit_trial_expired_seen', buildAccountScopedStorageKey('orbit_trial_expired_seen', 'user-1')]
    for (const key of keys) localStorage.setItem(key, 'saved')
    mockResetAccount.mockRejectedValueOnce(new UnrecognizedActionError('Unknown action'))
    const onOpenChange = vi.fn()
    render(<FreshStartModal open onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByText('profile.freshStart.reviewDeletion'))
    fireEvent.change(screen.getByLabelText('profile.freshStart.confirmLabel'), { target: { value: 'ORBIT' } })
    fireEvent.click(screen.getByText('profile.freshStart.deleteData'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'profile.freshStart.deleteData' })).toBeEnabled())
    expect(screen.getByRole('alert')).toBeVisible()
    for (const key of keys) expect(localStorage.getItem(key)).toBe('saved')
    expect(mockResetAccountQueries).not.toHaveBeenCalled()
    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(mockRouterRefresh).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(getHeldAccountId()).toBe('user-1')
  })

  it('keeps the replacement account intact when a pending reset fails', async () => {
    holdAccount('user-1')
    let reject!: (error: Error) => void
    mockResetAccount.mockReturnValueOnce(new Promise<void>((_resolve, rejectRequest) => { reject = rejectRequest }))
    render(<FreshStartModal open onOpenChange={vi.fn()} />)
    fireEvent.click(screen.getByText('profile.freshStart.reviewDeletion'))
    fireEvent.change(screen.getByLabelText('profile.freshStart.confirmLabel'), { target: { value: 'ORBIT' } })
    fireEvent.click(screen.getByText('profile.freshStart.deleteData'))
    vi.stubGlobal('fetch', vi.fn())
    await replaceAccountWith('user-2')
    mockResetAccountQueries.mockClear()
    await act(async () => reject(new Error('Old failure')))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(mockResetAccountQueries).not.toHaveBeenCalled()
    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(getHeldAccountId()).toBe('user-2')
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <FreshStartModal open={false} onOpenChange={vi.fn()} />,
    )
    expect(container.querySelector('[data-testid="overlay"]')).not.toBeInTheDocument()
  })

  it('renders overlay with the reset heading when open', () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByTestId('sheet')).toBeInTheDocument()
    expect(screen.getByText('profile.freshStart.heading')).toBeInTheDocument()
  })

  it('pins both steps\' actions in the sheet footer, never in the scrolling body', () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)
    expect(sheetSlotButtons('sheet-actions')).toEqual(['common.cancel', 'profile.freshStart.reviewDeletion'])
    expectSmallSheetActions()
    expect(sheetSlotButtons('sheet-body')).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'profile.freshStart.reviewDeletion' }))
    expect(sheetSlotButtons('sheet-actions')).toEqual(['common.cancel', 'profile.freshStart.deleteData'])
    expectSmallSheetActions()
    expect(sheetSlotButtons('sheet-body')).toEqual([])
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

  it('has a continue button in info step', () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'profile.freshStart.reviewDeletion' })).toHaveAttribute('data-variant', 'caution')
  })

  it('names the deletion review and lets both actions hug their labels in each step', () => {
    render(<FreshStartModal open onOpenChange={vi.fn()} />)
    const review = screen.getByRole('button', { name: 'profile.freshStart.reviewDeletion' })
    const cancel = screen.getByRole('button', { name: 'common.cancel' })
    expect(review.style.width).toBe('auto')
    expect(cancel.style.width).toBe('auto')

    fireEvent.click(review)
    const deleteData = screen.getByRole('button', { name: 'profile.freshStart.deleteData' })
    expect(deleteData.style.width).toBe('auto')
    expect(screen.getByRole('button', { name: 'common.cancel' }).style.width).toBe('auto')
  })

  it('transitions to confirm step on continue click', () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText('profile.freshStart.reviewDeletion'))

    const confirmField = screen.getByLabelText('profile.freshStart.confirmLabel')
    expect(confirmField).toHaveAccessibleDescription('profile.freshStart.confirmInstruction')
    expect(screen.getAllByText('profile.freshStart.confirmInstruction')).toHaveLength(1)
    expect(screen.getByPlaceholderText('profile.freshStart.confirmPlaceholder')).toBeInTheDocument()
  })

  it('moves focus to the confirm field, never leaving it on the disabled Delete data', () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)

    const review = screen.getByRole('button', { name: 'profile.freshStart.reviewDeletion' })
    review.focus()
    fireEvent.click(review)

    expect(screen.getByLabelText('profile.freshStart.confirmLabel')).toHaveFocus()
  })

  it('confirm button is disabled when text is not ORBIT', () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText('profile.freshStart.reviewDeletion'))

    const confirmBtn = screen.getByRole('button', { name: 'profile.freshStart.deleteData' })
    expect(confirmBtn).toHaveAttribute('data-variant', 'caution')
    expect(confirmBtn).toBeDisabled()
  })

  it('confirm button is disabled when input is partial', () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText('profile.freshStart.reviewDeletion'))

    const input = screen.getByPlaceholderText('profile.freshStart.confirmPlaceholder')
    fireEvent.change(input, { target: { value: 'ORB' } })

    const confirmBtn = screen.getByRole('button', { name: 'profile.freshStart.deleteData' })
    expect(confirmBtn).toBeDisabled()
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

  it('closes the sheet, clears queries and navigates after successful reset', async () => {
    const onOpenChange = vi.fn()
    render(<FreshStartModal open={true} onOpenChange={onOpenChange} />)

    fireEvent.click(screen.getByText('profile.freshStart.reviewDeletion'))

    const input = screen.getByPlaceholderText('profile.freshStart.confirmPlaceholder')
    fireEvent.change(input, { target: { value: 'ORBIT' } })

    fireEvent.click(screen.getByText('profile.freshStart.deleteData'))

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    await waitFor(() => {
      expect(mockResetAccountQueries).toHaveBeenCalledTimes(1)
      expect(mockRouterPush).toHaveBeenCalledWith('/')
      expect(mockRouterRefresh).toHaveBeenCalledTimes(1)
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

  it('shows a failed reset in the pinned footer, beside Delete data', async () => {
    mockResetAccount.mockRejectedValueOnce(new Error('Server error'))
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText('profile.freshStart.reviewDeletion'))
    fireEvent.change(screen.getByPlaceholderText('profile.freshStart.confirmPlaceholder'), { target: { value: 'ORBIT' } })
    fireEvent.click(screen.getByText('profile.freshStart.deleteData'))

    expect((await screen.findByRole('alert')).closest('[data-slot="sheet-actions"]')).not.toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(getHeldAccountId()).toBe('user-1')
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

  it('cancels through the exit transition rather than dropping the sheet', () => {
    sheetTestControls.defer(true)
    const onOpenChange = vi.fn()
    render(<FreshStartModal open onOpenChange={onOpenChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))

    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(onOpenChange).not.toHaveBeenCalled()

    sheetTestControls.completeDismissal()

    expect(onOpenChange).toHaveBeenCalledWith(false)
    sheetTestControls.defer(false)
  })

  it('resets state when the sheet closes', () => {
    const onOpenChange = vi.fn()

    render(
      <FreshStartModal open={true} onOpenChange={onOpenChange} />,
    )

    fireEvent.click(screen.getByText('profile.freshStart.reviewDeletion'))
    expect(screen.getByLabelText('profile.freshStart.confirmLabel')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'close-overlay' }))

    expect(screen.getByText('profile.freshStart.description')).toBeInTheDocument()
  })
})

describe('FreshStartModal across an account change', () => {
  beforeEach(() => {
    failureCopy.actual = false; failureCopy.locale = 'en'; failureCopy.realAdapter = false
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    mockResetAccount.mockResolvedValue(undefined)
    holdAccount('user-1')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function armTheErasure() {
    render(<FreshStartModal open onOpenChange={vi.fn()} />)
    fireEvent.click(screen.getByText('profile.freshStart.reviewDeletion'))
    const field = screen.getByLabelText('profile.freshStart.confirmLabel')
    fireEvent.change(field, { target: { value: 'ORBIT' } })
    expect(field).toHaveValue('ORBIT')
  }

  it('disarms the typed confirmation when another account replaces the tab', async () => {
    armTheErasure()

    await replaceAccountWith('user-2')

    expect(screen.getByText('profile.freshStart.description')).toBeInTheDocument()
    expect(screen.queryByLabelText('profile.freshStart.confirmLabel')).not.toBeInTheDocument()
  })

  it('keeps the typed confirmation when the same account recovers from a rejected refresh', async () => {
    armTheErasure()

    await recoverSameAccount('user-1')

    expect(screen.getByLabelText('profile.freshStart.confirmLabel')).toHaveValue('ORBIT')
  })

  it('does not clear the next account after a delayed reset completes', async () => {
    let releaseReset!: () => void
    mockResetAccount.mockImplementationOnce(() => new Promise<void>((resolve) => {
      releaseReset = resolve
    }))
    const nextNoticeKey = buildAccountScopedStorageKey('orbit_trial_expired_seen', 'user-2')
    localStorage.setItem(nextNoticeKey, '1')
    armTheErasure()
    fireEvent.click(screen.getByText('profile.freshStart.deleteData'))

    await replaceAccountWith('user-2')
    const resetsAfterAccountChange = mockResetAccountQueries.mock.calls.length
    await act(async () => { releaseReset(); await Promise.resolve() })

    expect(localStorage.getItem(nextNoticeKey)).toBe('1')
    expect(mockResetAccountQueries).toHaveBeenCalledTimes(resetsAfterAccountChange)
    expect(mockRouterPush).not.toHaveBeenCalled()
  })
})

describe('FreshStartModal and the trial notice', () => {
  const TRIAL_EXPIRED_SEEN_STORAGE_KEY = 'orbit_trial_expired_seen'

  beforeEach(() => {
    failureCopy.actual = false; failureCopy.locale = 'en'; failureCopy.realAdapter = false
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    localStorage.clear()
    mockResetAccount.mockResolvedValue(undefined)
    holdAccount('user-1')
  })

  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('lets the trial notice appear again, whichever key suppressed it', async () => {
    const scopedKey = buildAccountScopedStorageKey(TRIAL_EXPIRED_SEEN_STORAGE_KEY, 'user-1')
    localStorage.setItem(TRIAL_EXPIRED_SEEN_STORAGE_KEY, '1')
    localStorage.setItem(scopedKey, '1')

    render(<FreshStartModal open onOpenChange={vi.fn()} />)
    fireEvent.click(screen.getByText('profile.freshStart.reviewDeletion'))
    fireEvent.change(screen.getByLabelText('profile.freshStart.confirmLabel'), {
      target: { value: 'ORBIT' },
    })
    fireEvent.click(screen.getByText('profile.freshStart.deleteData'))

    await waitFor(() => {
      expect(mockResetAccount).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(localStorage.getItem(scopedKey)).toBeNull()
    })
    expect(localStorage.getItem(TRIAL_EXPIRED_SEEN_STORAGE_KEY)).toBeNull()
  })
})
