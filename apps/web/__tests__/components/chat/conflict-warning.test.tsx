import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { ConflictWarning } from '@/components/chat/conflict-warning'
import type { ConflictWarning as ConflictWarningType } from '@orbit/shared/types/chat'

function makeWarning(overrides: Partial<ConflictWarningType> = {}): ConflictWarningType {
  return {
    severity: 'MEDIUM',
    conflictingHabits: [],
    recommendation: null,
    ...overrides,
  } as ConflictWarningType
}

describe('ConflictWarning', () => {
  it('renders with HIGH severity styling', () => {
    const { container } = render(
      <ConflictWarning warning={makeWarning({ severity: 'HIGH' })} />,
    )
    const wrapper = container.firstElementChild
    expect(wrapper?.className).toContain('border-red-500')
  })

  it('renders with MEDIUM severity styling', () => {
    const { container } = render(
      <ConflictWarning warning={makeWarning({ severity: 'MEDIUM' })} />,
    )
    const wrapper = container.firstElementChild
    expect(wrapper?.className).toContain('border-amber-500')
  })

  it('renders with LOW severity styling', () => {
    const { container } = render(
      <ConflictWarning warning={makeWarning({ severity: 'LOW' })} />,
    )
    const wrapper = container.firstElementChild
    expect(wrapper?.className).toContain('border-blue-500')
  })

  it('renders conflicting habits', () => {
    const warning = makeWarning({
      conflictingHabits: [
        { habitId: 'h1', habitTitle: 'Exercise', conflictDescription: 'Same time slot' },
      ],
    })
    render(<ConflictWarning warning={warning} />)
    expect(screen.getByText('Exercise')).toBeInTheDocument()
    expect(screen.getByText(/Same time slot/)).toBeInTheDocument()
  })

  it('renders recommendation when present', () => {
    const warning = makeWarning({ recommendation: 'Consider adjusting schedule' })
    render(<ConflictWarning warning={warning} />)
    expect(screen.getByText('Consider adjusting schedule')).toBeInTheDocument()
  })

  it('renders title', () => {
    render(<ConflictWarning warning={makeWarning()} />)
    expect(screen.getByText('chat.conflict.title')).toBeInTheDocument()
  })
})
