import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks -- must come before component import
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
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

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({
    open,
    onOpenChange,
    title,
    children,
  }: {
    open: boolean
    onOpenChange: (v: boolean) => void
    title?: string
    children: React.ReactNode
  }) =>
    open ? (
      <div data-testid="overlay">
        {title && <h2>{title}</h2>}
        <button data-testid="overlay-close" onClick={() => onOpenChange(false)}>
          Close
        </button>
        <button data-testid="overlay-reopen" onClick={() => onOpenChange(true)}>
          Reopen
        </button>
        {children}
      </div>
    ) : null,
}))

vi.mock('@/components/ui/fresh-start-animation', () => ({
  FreshStartAnimation: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="fresh-start-animation">
      <button data-testid="animation-complete" onClick={onComplete}>
        Complete
      </button>
    </div>
  ),
}))

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import { FreshStartModal } from '@/app/(app)/profile/_components/fresh-start-modal'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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

  it('renders overlay with title when open', () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByTestId('overlay')).toBeInTheDocument()
    expect(screen.getByText('profile.freshStart.title')).toBeInTheDocument()
  })

  it('shows info step by default with description', () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('profile.freshStart.description')).toBeInTheDocument()
  })

  it('shows deleted items list in info step', () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('profile.freshStart.whatDeleted')).toBeInTheDocument()
    expect(screen.getByText('profile.freshStart.deleteHabits')).toBeInTheDocument()
    expect(screen.getByText('profile.freshStart.deleteGoals')).toBeInTheDocument()
    expect(screen.getByText('profile.freshStart.deleteChat')).toBeInTheDocument()
    expect(screen.getByText('profile.freshStart.deleteUserFacts')).toBeInTheDocument()
    expect(screen.getByText('profile.freshStart.deleteAchievements')).toBeInTheDocument()
    expect(screen.getByText('profile.freshStart.deleteNotifications')).toBeInTheDocument()
    expect(screen.getByText('profile.freshStart.deleteChecklist')).toBeInTheDocument()
    expect(screen.getByText('profile.freshStart.deleteOnboarding')).toBeInTheDocument()
  })

  it('shows preserved items list in info step', () => {
    render(<FreshStartModal open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('profile.freshStart.whatPreserved')).toBeInTheDocument()
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

    // Plain Error messages are surfaced directly by getErrorMessage.
    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })
  })

  it('resets state when overlay triggers onOpenChange(true)', () => {
    const onOpenChange = vi.fn()

    render(
      <FreshStartModal open={true} onOpenChange={onOpenChange} />,
    )

    // Navigate to confirm step
    fireEvent.click(screen.getByText('common.continue'))
    expect(screen.getByText('profile.freshStart.confirmInstruction')).toBeInTheDocument()

    // Simulate overlay triggering onOpenChange(true) which calls handleOpenChange(true) resetting state
    fireEvent.click(screen.getByTestId('overlay-reopen'))

    // Should be back at info step
    expect(screen.getByText('profile.freshStart.description')).toBeInTheDocument()
  })
})
