import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'


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
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    clear: mockQueryClientClear,
  }),
}))

const mockResetAccount = vi.fn()
vi.mock('@/app/actions/profile', () => ({
  resetAccount: (...args: unknown[]) => mockResetAccount(...args),
}))

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

vi.mock('@/components/ui/fresh-start-animation', () => ({
  FreshStartAnimation: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="fresh-start-animation">
      <button data-testid="animation-complete" onClick={onComplete}>
        Complete
      </button>
    </div>
  ),
}))


import { FreshStartModal } from '@/app/(app)/profile/_components/fresh-start-modal'


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

  it('closes modal and shows animation after successful reset', async () => {
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
      expect(screen.getByTestId('fresh-start-animation')).toBeInTheDocument()
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
