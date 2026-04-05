import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

vi.mock('@/components/chat/conflict-warning', () => ({
  ConflictWarning: () => <div data-testid="conflict-warning" />,
}))

import { ActionChips } from '@/components/chat/action-chips'
import type { ActionResult } from '@orbit/shared/types/chat'

function makeAction(overrides: Partial<ActionResult> = {}): ActionResult {
  return {
    type: 'LogHabit',
    status: 'Success',
    entityId: '1',
    entityName: 'Meditate',
    error: null,
    field: null,
    suggestedSubHabits: null,
    conflictWarning: null,
    ...overrides,
  }
}

describe('ActionChips', () => {
  it('renders action chips for each action', () => {
    const actions = [
      makeAction({ type: 'LogHabit', entityName: 'Meditate' }),
      makeAction({ type: 'CreateHabit', entityName: 'Exercise' }),
    ]
    const { container } = render(<ActionChips actions={actions} />)
    const chips = container.querySelectorAll('.animate-chip-in')
    expect(chips.length).toBe(2)
  })

  it('skips Suggestion status actions', () => {
    const actions = [
      makeAction({ status: 'Suggestion' }),
      makeAction({ status: 'Success' }),
    ]
    const { container } = render(<ActionChips actions={actions} />)
    const chips = container.querySelectorAll('.animate-chip-in')
    expect(chips.length).toBe(1)
  })

  it('shows success styling for successful actions', () => {
    const actions = [makeAction({ status: 'Success' })]
    const { container } = render(<ActionChips actions={actions} />)
    const chip = container.querySelector('.text-emerald-400')
    expect(chip).toBeInTheDocument()
  })

  it('shows error styling for failed actions', () => {
    const actions = [makeAction({ status: 'Failed', error: 'Something went wrong' })]
    const { container } = render(<ActionChips actions={actions} />)
    const chip = container.querySelector('.text-red-400')
    expect(chip).toBeInTheDocument()
  })

  it('displays error message for failed actions', () => {
    const actions = [makeAction({ status: 'Failed', error: 'Something went wrong' })]
    render(<ActionChips actions={actions} />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('renders action label with entity name', () => {
    const actions = [makeAction({ type: 'LogHabit', entityName: 'Meditate' })]
    render(<ActionChips actions={actions} />)
    expect(document.body.textContent).toContain('chat.action.logged')
  })

  it('handles unknown action types with fallback', () => {
    const actions = [makeAction({ type: 'LogHabit', entityName: null })]
    render(<ActionChips actions={actions} />)
    expect(document.body.textContent).toContain('chat.unknownEntity')
  })

  it('renders conflict warning when present', () => {
    const actions = [
      makeAction({
        conflictWarning: {
          hasConflict: true,
          conflictingHabits: [],
          severity: 'HIGH',
          recommendation: null,
        },
      }),
    ]
    render(<ActionChips actions={actions} />)
    expect(screen.getByTestId('conflict-warning')).toBeInTheDocument()
  })

  it('does not render conflict warning when not present', () => {
    const actions = [makeAction({ conflictWarning: null })]
    render(<ActionChips actions={actions} />)
    expect(screen.queryByTestId('conflict-warning')).not.toBeInTheDocument()
  })

  it('applies staggered animation delays', () => {
    const actions = [
      makeAction({ entityName: 'A' }),
      makeAction({ entityName: 'B' }),
      makeAction({ entityName: 'C' }),
    ]
    const { container } = render(<ActionChips actions={actions} />)
    const chips = container.querySelectorAll('.animate-chip-in')
    expect(chips[0]).toHaveStyle({ animationDelay: '0ms' })
    expect(chips[1]).toHaveStyle({ animationDelay: '80ms' })
    expect(chips[2]).toHaveStyle({ animationDelay: '160ms' })
  })
})
