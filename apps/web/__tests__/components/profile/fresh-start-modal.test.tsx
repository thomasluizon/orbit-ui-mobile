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
