import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { LogHabitModal } from '@/components/habits/log-habit-modal'
import { createMockHabit } from '@orbit/shared/__tests__/factories'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMutateAsync = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, params?: Record<string, unknown>) => {
      if (params && Object.keys(params).length > 0) {
        return `${key}(${JSON.stringify(params)})`
      }
      return key
    }
    return t
  },
}))

vi.mock('@/hooks/use-habits', () => ({
  useLogHabit: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
    error: null,
  }),
}))

vi.mock('@/components/ui/app-overlay', () => ({
  AppOverlay: ({
    open,
    children,
    footer,
    title,
    description,
  }: {
    open: boolean
    children: React.ReactNode
    footer?: React.ReactNode
    title?: string
    description?: string
  }) =>
    open ? (
      <div data-testid="app-overlay">
        {title && <h2>{title}</h2>}
        {description && <p>{description}</p>}
        {children}
        {footer}
      </div>
    ) : null,
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LogHabitModal', () => {
  const defaultHabit = createMockHabit({ id: 'h-1', title: 'Exercise' })

  beforeEach(() => {
    vi.clearAllMocks()
    mockMutateAsync.mockResolvedValue({})
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <LogHabitModal open={false} onOpenChange={vi.fn()} habit={defaultHabit} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders the overlay when open', () => {
    render(
      <LogHabitModal open={true} onOpenChange={vi.fn()} habit={defaultHabit} />,
    )
    expect(screen.getByTestId('app-overlay')).toBeDefined()
  })

  it('displays the habit title', () => {
    render(
      <LogHabitModal open={true} onOpenChange={vi.fn()} habit={defaultHabit} />,
    )
    expect(screen.getByText('Exercise')).toBeDefined()
  })

  it('displays the title and description from i18n', () => {
    render(
      <LogHabitModal open={true} onOpenChange={vi.fn()} habit={defaultHabit} />,
    )
    expect(screen.getByText('habits.log.title')).toBeDefined()
    expect(screen.getByText('habits.log.description')).toBeDefined()
  })

  it('renders the note textarea', () => {
    render(
      <LogHabitModal open={true} onOpenChange={vi.fn()} habit={defaultHabit} />,
    )
    expect(screen.getByPlaceholderText('habits.log.notePlaceholder')).toBeDefined()
  })

  it('renders the cancel and log buttons', () => {
    render(
      <LogHabitModal open={true} onOpenChange={vi.fn()} habit={defaultHabit} />,
    )
    expect(screen.getByText('common.cancel')).toBeDefined()
    expect(screen.getByText('habits.logHabit')).toBeDefined()
  })

  it('calls onOpenChange(false) when cancel is clicked', () => {
    const onOpenChange = vi.fn()
    render(
      <LogHabitModal open={true} onOpenChange={onOpenChange} habit={defaultHabit} />,
    )
    fireEvent.click(screen.getByText('common.cancel'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('submits log with note when log button is clicked', async () => {
    const onLogged = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <LogHabitModal
        open={true}
        onOpenChange={onOpenChange}
        habit={defaultHabit}
        onLogged={onLogged}
      />,
    )

    const textarea = screen.getByPlaceholderText('habits.log.notePlaceholder')
    fireEvent.change(textarea, { target: { value: 'Ran 5km' } })
    fireEvent.click(screen.getByText('habits.logHabit'))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        habitId: 'h-1',
        note: 'Ran 5km',
      })
    })
  })

  it('submits log without note when note is empty', async () => {
    const onOpenChange = vi.fn()
    render(
      <LogHabitModal
        open={true}
        onOpenChange={onOpenChange}
        habit={defaultHabit}
      />,
    )

    fireEvent.click(screen.getByText('habits.logHabit'))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        habitId: 'h-1',
        note: undefined,
      })
    })
  })

  it('calls onLogged and closes after successful log', async () => {
    const onLogged = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <LogHabitModal
        open={true}
        onOpenChange={onOpenChange}
        habit={defaultHabit}
        onLogged={onLogged}
      />,
    )

    fireEvent.click(screen.getByText('habits.logHabit'))

    await waitFor(() => {
      expect(onLogged).toHaveBeenCalledWith('h-1')
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it('does not crash when habit is null', () => {
    const { container } = render(
      <LogHabitModal open={true} onOpenChange={vi.fn()} habit={null} />,
    )
    // The overlay renders but without habit content
    expect(container).toBeDefined()
  })

  it('does not submit when habit is null', async () => {
    render(
      <LogHabitModal open={true} onOpenChange={vi.fn()} habit={null} />,
    )
    // There is no submit button content rendered when habit is null,
    // but the footer still shows. Click the log button.
    const logBtn = screen.getByText('habits.logHabit')
    fireEvent.click(logBtn)
    await waitFor(() => {
      expect(mockMutateAsync).not.toHaveBeenCalled()
    })
  })
})
