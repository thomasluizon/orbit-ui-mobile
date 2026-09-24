import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'


vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

const mockRouterPush = vi.fn()
const mockRouterRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    refresh: mockRouterRefresh,
  }),
}))

const mockQueryClientClear = vi.fn()
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({
    clear: mockQueryClientClear,
  }),
}))

const mockResetAccount = vi.fn()
vi.mock('@/lib/actions/profile', () => ({
  resetAccount: (...args: unknown[]) => mockResetAccount(...args),
}))

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

import { sheetTestControls } from '@/__tests__/support/sheet-double'



import { buildAccountScopedStorageKey } from '@orbit/shared/utils'
import { FreshStartModal } from '@/app/(app)/profile/_components/fresh-start-modal'
import {
  holdAccount,
  recoverSameAccount,
  replaceAccountWith,
} from '@/__tests__/support/account-change'


describe('FreshStartModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResetAccount.mockResolvedValue(undefined)
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
    expect(screen.getByText('common.continue')).toBeInTheDocument()
  })

  it('transitions to confirm step on continue click', () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText('common.continue'))

    expect(screen.getByText('profile.freshStart.confirmInstruction')).toBeInTheDocument()
    expect(screen.getByLabelText('profile.freshStart.confirmLabel')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('profile.freshStart.confirmPlaceholder')).toBeInTheDocument()
  })

  it('confirm button is disabled when text is not ORBIT', () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText('common.continue'))

    const confirmBtn = screen.getByText('profile.freshStart.confirmButton')
    expect(confirmBtn).toBeDisabled()
  })

  it('confirm button is disabled when input is partial', () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText('common.continue'))

    const input = screen.getByPlaceholderText('profile.freshStart.confirmPlaceholder')
    fireEvent.change(input, { target: { value: 'ORB' } })

    const confirmBtn = screen.getByText('profile.freshStart.confirmButton')
    expect(confirmBtn).toBeDisabled()
  })

  it('confirm button becomes enabled when user types ORBIT', () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText('common.continue'))

    const input = screen.getByPlaceholderText('profile.freshStart.confirmPlaceholder')
    fireEvent.change(input, { target: { value: 'ORBIT' } })

    const confirmBtn = screen.getByText('profile.freshStart.confirmButton')
    expect(confirmBtn).not.toBeDisabled()
  })

  it('accepts case-insensitive ORBIT input', () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText('common.continue'))

    const input = screen.getByPlaceholderText('profile.freshStart.confirmPlaceholder')
    fireEvent.change(input, { target: { value: 'orbit' } })

    const confirmBtn = screen.getByText('profile.freshStart.confirmButton')
    expect(confirmBtn).not.toBeDisabled()
  })

  it('calls resetAccount when confirmed', async () => {
    const onOpenChange = vi.fn()
    render(<FreshStartModal open={true} onOpenChange={onOpenChange} />)

    fireEvent.click(screen.getByText('common.continue'))

    const input = screen.getByPlaceholderText('profile.freshStart.confirmPlaceholder')
    fireEvent.change(input, { target: { value: 'ORBIT' } })

    fireEvent.click(screen.getByText('profile.freshStart.confirmButton'))

    await waitFor(() => {
      expect(mockResetAccount).toHaveBeenCalledTimes(1)
    })
  })

  it('closes the sheet, clears queries and navigates after successful reset', async () => {
    const onOpenChange = vi.fn()
    render(<FreshStartModal open={true} onOpenChange={onOpenChange} />)

    fireEvent.click(screen.getByText('common.continue'))

    const input = screen.getByPlaceholderText('profile.freshStart.confirmPlaceholder')
    fireEvent.change(input, { target: { value: 'ORBIT' } })

    fireEvent.click(screen.getByText('profile.freshStart.confirmButton'))

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    await waitFor(() => {
      expect(mockQueryClientClear).toHaveBeenCalledTimes(1)
      expect(mockRouterPush).toHaveBeenCalledWith('/')
      expect(mockRouterRefresh).toHaveBeenCalledTimes(1)
    })
  })

  it('shows error when resetAccount fails', async () => {
    mockResetAccount.mockRejectedValueOnce(new Error('Server error'))

    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText('common.continue'))

    const input = screen.getByPlaceholderText('profile.freshStart.confirmPlaceholder')
    fireEvent.change(input, { target: { value: 'ORBIT' } })

    fireEvent.click(screen.getByText('profile.freshStart.confirmButton'))

    await waitFor(() => {
      expect(screen.getByText('profile.freshStart.errorGeneric')).toBeInTheDocument()
    })
    expect(screen.queryByText('Server error')).not.toBeInTheDocument()
    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(mockQueryClientClear).not.toHaveBeenCalled()
  })

  it('submits the reset on Enter once ORBIT is typed', async () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText('common.continue'))

    const input = screen.getByPlaceholderText('profile.freshStart.confirmPlaceholder')
    fireEvent.change(input, { target: { value: 'ORBIT' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mockResetAccount).toHaveBeenCalledTimes(1)
    })
  })

  it('ignores Enter while the confirmation text is invalid', () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText('common.continue'))

    const input = screen.getByPlaceholderText('profile.freshStart.confirmPlaceholder')
    fireEvent.change(input, { target: { value: 'ORB' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mockResetAccount).not.toHaveBeenCalled()
  })

  it('cancels through the exit transition rather than dropping the sheet', () => {
    sheetTestControls.defer(true)
    const onOpenChange = vi.fn()
    render(<FreshStartModal open onOpenChange={onOpenChange} />)

    fireEvent.click(screen.getByText('common.cancel'))

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

    fireEvent.click(screen.getByText('common.continue'))
    expect(screen.getByText('profile.freshStart.confirmInstruction')).toBeInTheDocument()
    expect(screen.getByLabelText('profile.freshStart.confirmLabel')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'close-overlay' }))

    expect(screen.getByText('profile.freshStart.description')).toBeInTheDocument()
  })
})

describe('FreshStartModal across an account change', () => {
  beforeEach(() => {
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
    fireEvent.click(screen.getByText('common.continue'))
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
    fireEvent.click(screen.getByText('profile.freshStart.confirmButton'))

    await replaceAccountWith('user-2')
    await act(async () => { releaseReset(); await Promise.resolve() })

    expect(localStorage.getItem(nextNoticeKey)).toBe('1')
    expect(mockQueryClientClear).not.toHaveBeenCalled()
    expect(mockRouterPush).not.toHaveBeenCalled()
  })
})

describe('FreshStartModal and the trial notice', () => {
  const TRIAL_EXPIRED_SEEN_STORAGE_KEY = 'orbit_trial_expired_seen'

  beforeEach(() => {
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
    fireEvent.click(screen.getByText('common.continue'))
    fireEvent.change(screen.getByLabelText('profile.freshStart.confirmLabel'), {
      target: { value: 'ORBIT' },
    })
    fireEvent.click(screen.getByText('profile.freshStart.confirmButton'))

    await waitFor(() => {
      expect(mockResetAccount).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(localStorage.getItem(scopedKey)).toBeNull()
    })
    expect(localStorage.getItem(TRIAL_EXPIRED_SEEN_STORAGE_KEY)).toBeNull()
  })
})
